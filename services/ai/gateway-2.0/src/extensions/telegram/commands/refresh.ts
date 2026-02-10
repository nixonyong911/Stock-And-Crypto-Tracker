import { Composer } from 'grammy';
import crypto from 'node:crypto';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('refresh', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) { await ctx.reply('Error: Could not identify user.'); return; }
  if (!ctx.activeSession) { await ctx.reply('❌ You are not logged in.\n\nUse /login to start a session first.'); return; }

  try {
    const newCliSessionId = crypto.randomUUID();
    await ctx.gatewayAPI.db.query(
      'UPDATE gateway_sessions SET cli_session_id = $1 WHERE platform_user_id = $2 AND channel_type = $3 AND expires_at > NOW()',
      [newCliSessionId, String(userId), 'telegram']
    );
    ctx.gatewayAPI.logger.info({ userId, oldId: ctx.activeSession.cliSessionId, newId: newCliSessionId }, 'CLI session refreshed');
    await ctx.reply('🔄 **Conversation context refreshed!**\n\nYour AI conversation has been reset.\n\nPrevious context has been cleared. You can now start a fresh conversation.', { parse_mode: 'Markdown' });
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, 'Refresh failed');
    await ctx.reply('❌ Failed to refresh. Please try again later.');
  }
});
export default composer;
