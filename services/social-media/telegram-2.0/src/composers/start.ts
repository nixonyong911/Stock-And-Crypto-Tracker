import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';
import type { TelegramUserRow, DeviceInfo } from '../types/session.js';
import { checkRateLimit, logger } from '../middleware/index.js';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

const composer = new Composer<BotContext>();

/**
 * Extract device info from Telegram update
 */
function getDeviceInfo(ctx: BotContext): DeviceInfo {
  return {
    language_code: ctx.from?.language_code,
    chat_type: ctx.chat?.type,
    is_bot: ctx.from?.is_bot,
  };
}

composer.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  // Check if user exists
  const existingUser = await ctx.db.fetchOne<TelegramUserRow>(
    'SELECT * FROM telegram_users WHERE telegram_user_id = $1',
    userId
  );

  if (existingUser) {
    // Existing user - welcome back
    await ctx.reply(
      `👋 Welcome back, ${existingUser.display_name}!\n\n` +
      'Use /login to start a new session.\n' +
      'Use /help to see available commands.'
    );
    return;
  }

  // New user - prompt for registration
  // Store pending registration state
  (ctx as BotContext & { pendingRegister?: boolean }).pendingRegister = true;

  await ctx.reply(
    '👋 **Welcome to Stock Tracker Bot!**\n\n' +
    'This bot helps you analyze stocks and crypto using AI.\n\n' +
    'Would you like to register?\n\n' +
    'Reply **Yes** or **No**',
    { parse_mode: 'Markdown' }
  );
});

/**
 * Handle Yes/No response for registration
 */
composer.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.toLowerCase().trim();
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  // Check if this is a registration response
  // We need to track this differently since grammY doesn't have user_data
  // For now, check if user doesn't exist and text is yes/no
  if (!userId || !chatId) {
    return next();
  }

  if (text !== 'yes' && text !== 'y' && text !== 'no' && text !== 'n') {
    return next();
  }

  // Check if user exists
  const existingUser = await ctx.db.fetchOne<TelegramUserRow>(
    'SELECT * FROM telegram_users WHERE telegram_user_id = $1',
    userId
  );

  if (existingUser) {
    return next();
  }

  // This is a registration response
  if (text === 'yes' || text === 'y') {
    // Check rate limit
    const rateLimit = await checkRateLimit(ctx, userId, 'register');
    if (!rateLimit.allowed) {
      await ctx.reply(
        `⚠️ Too many registration attempts.\n\n` +
        `Please try again in ${rateLimit.retryAfterMinutes} minute(s).`
      );
      return;
    }

    try {
      // Create user
      const user = await ctx.db.fetchOne<TelegramUserRow>(
        `INSERT INTO telegram_users (telegram_user_id, display_name, telegram_username)
         VALUES ($1, $2, $3)
         RETURNING *`,
        userId,
        ctx.from?.first_name || 'User',
        ctx.from?.username
      );

      if (!user) {
        throw new Error('Failed to create user');
      }

      // Auto-login after registration
      const deviceInfo = getDeviceInfo(ctx);
      const cursorChatId = uuidv4();
      const expiresAt = new Date(Date.now() + config.sessionExpiryDays * 24 * 60 * 60 * 1000);

      await ctx.db.execute(
        `INSERT INTO telegram_sessions 
         (user_id, telegram_user_id, telegram_chat_id, expires_at, device_info, cursor_chat_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        user.id,
        userId,
        chatId,
        expiresAt,
        JSON.stringify(deviceInfo),
        cursorChatId
      );

      logger.info({
        user_id: userId,
        cursor_chat_id: cursorChatId,
      }, 'User registered and logged in');

      await ctx.reply(
        `✅ **Registration complete!**\n\n` +
        `Welcome, ${user.display_name}! 🎉\n\n` +
        'You\'re now registered and logged in.\n\n' +
        'You can ask me financial questions. Try:\n' +
        '• "What are today\'s bullish stocks?"\n' +
        '• "Show me pattern statistics for the week"\n\n' +
        `Your session is valid for ${config.sessionExpiryDays} days.`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error({
        error: (error as Error).message,
        user_id: userId,
      }, 'Registration failed');

      await ctx.reply('❌ Registration failed. Please try again later.');
    }
  } else {
    // User declined registration
    await ctx.reply(
      '👋 Registration cancelled.\n\n' +
      'Feel free to register anytime by sending /start!'
    );
  }
});

export default composer;
