import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('login', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) { await ctx.reply('Error: Could not identify user.'); return; }

  // Check if registered in channel_accounts
  const account = await ctx.gatewayAPI.db.query(
    'SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2',
    [String(userId), 'telegram']
  );
  if (!account.rows[0]) {
    await ctx.reply('❌ You are not registered.\n\nUse /start to register first.');
    return;
  }

  try {
    // Expire existing sessions
    await ctx.gatewayAPI.db.query(
      `UPDATE gateway_sessions SET expires_at = NOW() WHERE platform_user_id = $1 AND channel_type = $2 AND expires_at > NOW()`,
      [String(userId), 'telegram']
    );

    // Create new session
    const expiresAt = new Date(Date.now() + ctx.telegramConfig.sessionExpiryDays * 24 * 60 * 60 * 1000);
    const deviceInfo = { language_code: ctx.from?.language_code, chat_type: ctx.chat?.type, is_bot: ctx.from?.is_bot };

    await ctx.gatewayAPI.db.query(
      `INSERT INTO gateway_sessions (channel_type, platform_user_id, platform_chat_id, tier, device_info, expires_at, clerk_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['telegram', String(userId), String(chatId), account.rows[0].clerk_user_id ? 'free' : 'free',
       JSON.stringify(deviceInfo), expiresAt, account.rows[0].clerk_user_id]
    );

    ctx.gatewayAPI.logger.info({ userId }, 'User logged in');
    await ctx.reply(
      `✅ **Logged in successfully!**\n\nWelcome back, ${account.rows[0].display_name}! 🎉\n\nYour session is valid for ${ctx.telegramConfig.sessionExpiryDays} days.\n\nAny previous sessions have been logged out.\n\nYou can now ask me financial questions!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, 'Login failed');
    await ctx.reply('❌ Login failed. Please try again later.');
  }
});
export default composer;
