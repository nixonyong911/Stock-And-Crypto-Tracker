import { Composer } from 'grammy';
import { v4 as uuidv4 } from 'uuid';
import type { BotContext } from '../types/context.js';
import type { TelegramUserRow, DeviceInfo } from '../types/session.js';
import { checkRateLimit, logger } from '../middleware/index.js';
import { config } from '../config.js';

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

composer.command('login', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  // Check if user is registered
  const user = await ctx.db.fetchOne<TelegramUserRow>(
    'SELECT * FROM telegram_users WHERE telegram_user_id = $1',
    userId
  );

  if (!user) {
    await ctx.reply(
      '❌ You are not registered.\n\n' +
      'Use /start to register first.'
    );
    return;
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(ctx, userId, 'login');
  if (!rateLimit.allowed) {
    await ctx.reply(
      `⚠️ Too many login attempts.\n\n` +
      `Please try again in ${rateLimit.retryAfterMinutes} minute(s).`
    );
    return;
  }

  try {
    const deviceInfo = getDeviceInfo(ctx);
    const cursorChatId = uuidv4();
    const expiresAt = new Date(Date.now() + config.sessionExpiryDays * 24 * 60 * 60 * 1000);

    // Transaction: Delete all existing sessions and create new one
    await ctx.db.transaction(async (tx) => {
      // Single-session policy: Delete ALL existing sessions for this user
      await tx.execute(
        'DELETE FROM telegram_sessions WHERE telegram_user_id = $1',
        userId
      );

      // Create new session with cursor_chat_id
      await tx.execute(
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
    });

    logger.info({
      user_id: userId,
      cursor_chat_id: cursorChatId,
    }, 'User logged in');

    await ctx.reply(
      `✅ **Logged in successfully!**\n\n` +
      `Welcome back, ${user.display_name}! 🎉\n\n` +
      `Your session is valid for ${config.sessionExpiryDays} days.\n\n` +
      'Any previous sessions on other devices have been logged out.\n\n' +
      'You can now ask me financial questions!',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'Login failed');

    await ctx.reply('❌ Login failed. Please try again later.');
  }
});

export default composer;
