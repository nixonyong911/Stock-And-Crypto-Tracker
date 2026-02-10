import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('logout', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) { await ctx.reply('Error: Could not identify user.'); return; }
  if (!ctx.activeSession) { await ctx.reply('❌ You are not logged in.\n\nUse /login to start a session.'); return; }

  try {
    await ctx.gatewayAPI.db.query(
      'UPDATE gateway_sessions SET expires_at = NOW() WHERE platform_user_id = $1 AND channel_type = $2 AND expires_at > NOW()',
      [String(userId), 'telegram']
    );
    ctx.gatewayAPI.logger.info({ userId }, 'User logged out');
    await ctx.reply('👋 **Logged out successfully!**\n\nYour session has been ended.\n\nUse /login to start a new session.', { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, 'Logout failed');
    await ctx.reply('❌ Logout failed. Please try again later.');
  }
});
export default composer;
