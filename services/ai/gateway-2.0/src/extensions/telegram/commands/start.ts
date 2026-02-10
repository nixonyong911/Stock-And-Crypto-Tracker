import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();

composer.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) { await ctx.reply('Error: Could not identify user.'); return; }

  // Check if user exists in channel_accounts
  const existing = await ctx.gatewayAPI.db.query(
    'SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2',
    [String(userId), 'telegram']
  );

  if (existing.rows[0]) {
    await ctx.reply(
      `👋 Welcome back, ${existing.rows[0].display_name}!\n\nUse /login to start a new session.\nUse /help to see available commands.`
    );
    return;
  }

  // Prompt for registration
  await ctx.reply(
    '👋 **Welcome to Stock Tracker Bot!**\n\nThis bot helps you analyze stocks and crypto using AI.\n\nWould you like to register?\n\nReply **Yes** or **No**',
    { parse_mode: 'Markdown' }
  );
});

// Handle Yes/No registration response
composer.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.toLowerCase().trim();
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) return next();
  if (text !== 'yes' && text !== 'y' && text !== 'no' && text !== 'n') return next();

  // Check if already registered
  const existing = await ctx.gatewayAPI.db.query(
    'SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2',
    [String(userId), 'telegram']
  );
  if (existing.rows[0]) return next();

  if (text === 'yes' || text === 'y') {
    try {
      // Create channel_account (unified schema)
      await ctx.gatewayAPI.db.query(
        `INSERT INTO channel_accounts (channel_type, platform_user_id, platform_username, display_name)
         VALUES ($1, $2, $3, $4) ON CONFLICT (channel_type, platform_user_id) DO NOTHING`,
        ['telegram', String(userId), ctx.from?.username ?? null, ctx.from?.first_name ?? 'User']
      );

      // Auto-login: create session
      const expiresAt = new Date(Date.now() + ctx.telegramConfig.sessionExpiryDays * 24 * 60 * 60 * 1000);
      await ctx.gatewayAPI.db.query(
        `INSERT INTO gateway_sessions (channel_type, platform_user_id, platform_chat_id, tier, device_info, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['telegram', String(userId), String(chatId), 'free',
         JSON.stringify({ language_code: ctx.from?.language_code, chat_type: ctx.chat?.type, is_bot: ctx.from?.is_bot }),
         expiresAt]
      );

      ctx.gatewayAPI.logger.info({ userId, chatId }, 'User registered and logged in');
      await ctx.reply(
        `✅ **Registration complete!**\n\nWelcome, ${ctx.from?.first_name ?? 'User'}! 🎉\n\nYou're now registered and logged in.\n\nYou can ask me financial questions. Try:\n• "What are today's bullish stocks?"\n• "Show me pattern statistics for the week"\n\nYour session is valid for ${ctx.telegramConfig.sessionExpiryDays} days.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      ctx.gatewayAPI.logger.error({ err, userId }, 'Registration failed');
      await ctx.reply('❌ Registration failed. Please try again later.');
    }
  } else {
    await ctx.reply('👋 Registration cancelled.\n\nFeel free to register anytime by sending /start!');
  }
});

export default composer;
