import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('status', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) { await ctx.reply('Error: Could not identify user.'); return; }

  // Check registration
  const account = await ctx.gatewayAPI.db.query(
    'SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2',
    [String(userId), 'telegram']
  );
  if (!account.rows[0]) {
    await ctx.reply('📊 **Status: Not Registered**\n\nYou have not registered yet.\n\nUse /start to register.', { parse_mode: 'Markdown' });
    return;
  }

  if (!ctx.activeSession) {
    await ctx.reply(
      `📊 **Status: Registered but Not Logged In**\n\n👤 User: ${account.rows[0].display_name}\n📝 Username: @${account.rows[0].platform_username || 'not set'}\n\nUse /login to start a session.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const s = ctx.activeSession;
  const daysRemaining = Math.ceil((s.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  await ctx.reply(
    `📊 **Status: Active Session**\n\n👤 User: ${s.displayName || account.rows[0].display_name}\n📝 Username: @${s.platformUsername || account.rows[0].platform_username || 'not set'}\n\n🏷️ User Tier: ${s.tier.charAt(0).toUpperCase() + s.tier.slice(1)}\n⏰ Expires: ${s.expiresAt.toLocaleDateString()} (${daysRemaining} days)\n📅 Last Active: ${s.lastActiveAt.toLocaleString()}\n\n✅ You can ask me financial questions!`,
    { parse_mode: 'Markdown' }
  );
});
export default composer;
