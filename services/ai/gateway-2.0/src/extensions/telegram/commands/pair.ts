import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

const composer = new Composer<TelegramBotContext>();
composer.command('pair', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) { await ctx.reply('Error: Could not identify user.'); return; }

  const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
  const code = args[0]?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    await ctx.reply('🔗 **Pair your web account**\n\nUsage: `/pair <6-digit code>`\n\nGet your code from the dashboard.\n\nExample: `/pair 483291`', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const db = ctx.gatewayAPI.db;
    // Step 1: Verify code
    const tokenResult = await db.query(
      `SELECT * FROM users_link_tokens WHERE token = $1 AND direction = 'web_to_telegram' AND used_at IS NULL AND expires_at > NOW()`,
      [code]
    );
    const linkToken = tokenResult.rows[0];
    if (!linkToken?.user_id) {
      await ctx.reply('❌ **Invalid or expired code**\n\nPlease generate a new code from the web dashboard.', { parse_mode: 'Markdown' });
      return;
    }

    // Step 2: Check if already paired
    const existingLink = await db.query('SELECT id, email FROM users WHERE telegram_user_id = $1', [userId]);
    if (existingLink.rows[0]) {
      await ctx.reply(`⚠️ **Already paired**\n\nThis Telegram account is already linked to ${existingLink.rows[0].email}.`, { parse_mode: 'Markdown' });
      return;
    }

    // Step 3: Get target user
    const targetResult = await db.query('SELECT id, email, telegram_user_id, tier, clerk_user_id FROM users WHERE id = $1', [linkToken.user_id]);
    const targetUser = targetResult.rows[0];
    if (!targetUser) { await ctx.reply('❌ Web account not found.'); return; }
    if (targetUser.telegram_user_id) {
      await ctx.reply('⚠️ **Account already paired**\n\nThis web account already has a Telegram account linked.', { parse_mode: 'Markdown' });
      return;
    }

    // Step 4: Link accounts
    await db.query('UPDATE users SET telegram_user_id = $1, updated_at = NOW() WHERE id = $2', [userId, linkToken.user_id]);
    await db.query('UPDATE users_link_tokens SET used_at = NOW(), telegram_user_id = $1 WHERE id = $2', [userId, linkToken.id]);

    // Step 5: Update channel_account with clerk_user_id
    await db.query(
      `INSERT INTO channel_accounts (channel_type, platform_user_id, platform_username, display_name, clerk_user_id, paired_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (channel_type, platform_user_id) DO UPDATE SET clerk_user_id = $5, paired_at = NOW()`,
      ['telegram', String(userId), ctx.from?.username ?? null, ctx.from?.first_name ?? 'User', targetUser.clerk_user_id]
    );

    const tierDisplay = targetUser.tier?.charAt(0).toUpperCase() + (targetUser.tier?.slice(1) || 'free');
    await ctx.reply(
      `✅ **Pairing successful!**\n\nLinked to: ${targetUser.email}\nSubscription: ${tierDisplay}\n\nYour subscription tier is now active in Telegram.\nUse /login to start a chat session.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, 'Pairing failed');
    await ctx.reply('❌ **Pairing failed**\n\nAn unexpected error occurred. Please try again.', { parse_mode: 'Markdown' });
  }
});
export default composer;
