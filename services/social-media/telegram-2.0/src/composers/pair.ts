import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';
import { logger } from '../middleware/index.js';

const composer = new Composer<BotContext>();

/**
 * /pair <code> - Link this Telegram account to a web account using a 6-digit pairing code.
 *
 * Flow:
 * 1. User generates code on the web dashboard
 * 2. User sends /pair 483291 in Telegram
 * 3. Bot validates code against users_link_tokens table
 * 4. Bot links telegram_user_id to the web user
 * 5. Bot confirms pairing with tier info
 */
composer.command('pair', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    await ctx.reply('Error: Could not identify user.');
    return;
  }

  // Extract pairing code from command args
  const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
  const code = args[0]?.trim();

  if (!code || !/^\d{6}$/.test(code)) {
    await ctx.reply(
      '🔗 **Pair your web account**\n\n' +
      'Usage: `/pair <6-digit code>`\n\n' +
      'Get your code from the dashboard at stockandcryptotracker.com/dashboard\n\n' +
      'Example: `/pair 483291`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  logger.info({
    user_id: userId,
    code_prefix: code.substring(0, 2) + '****',
  }, 'Pairing attempt');

  try {
    // Step 1: Verify the code exists and hasn't expired
    const linkToken = await ctx.db.fetchOne<{
      id: number;
      token: string;
      user_id: number;
      direction: string;
      expires_at: string;
      used_at: string | null;
    }>(
      `SELECT * FROM users_link_tokens
       WHERE token = $1
         AND direction = 'web_to_telegram'
         AND used_at IS NULL
         AND expires_at > NOW()`,
      code
    );

    if (!linkToken || !linkToken.user_id) {
      await ctx.reply(
        '❌ **Invalid or expired code**\n\n' +
        'The pairing code is incorrect or has expired.\n' +
        'Please generate a new code from the web dashboard.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Step 2: Check if this Telegram user is already paired to another account
    const existingLink = await ctx.db.fetchOne<{ id: number; email: string }>(
      `SELECT id, email FROM users WHERE telegram_user_id = $1`,
      userId
    );

    if (existingLink) {
      await ctx.reply(
        '⚠️ **Already paired**\n\n' +
        `This Telegram account is already linked to ${existingLink.email}.\n\n` +
        'To pair with a different account, first unlink from the web dashboard.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Step 3: Check if the target web user already has a Telegram linked
    const targetUser = await ctx.db.fetchOne<{
      id: number;
      email: string;
      telegram_user_id: number | null;
      tier: string;
    }>(
      `SELECT id, email, telegram_user_id, tier FROM users WHERE id = $1`,
      linkToken.user_id
    );

    if (!targetUser) {
      await ctx.reply('❌ Web account not found. Please try again.');
      return;
    }

    if (targetUser.telegram_user_id) {
      await ctx.reply(
        '⚠️ **Account already paired**\n\n' +
        'This web account already has a Telegram account linked.\n' +
        'Unlink it from the web dashboard first.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Step 4: Link the accounts (transaction-like: update user, mark token used)
    // Update users table with telegram_user_id
    await ctx.db.execute(
      `UPDATE users SET telegram_user_id = $1, updated_at = NOW() WHERE id = $2`,
      userId,
      linkToken.user_id
    );

    // Mark the token as used
    await ctx.db.execute(
      `UPDATE users_link_tokens SET used_at = NOW(), telegram_user_id = $1 WHERE id = $2`,
      userId,
      linkToken.id
    );

    // Step 5: Ensure telegram_users row exists (may already exist from /start)
    const telegramUser = await ctx.db.fetchOne<{ id: number }>(
      `SELECT id FROM telegram_users WHERE telegram_user_id = $1`,
      userId
    );

    if (!telegramUser) {
      // Create telegram_users entry if user hasn't used /start before
      await ctx.db.execute(
        `INSERT INTO telegram_users (telegram_user_id, display_name, telegram_username)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_user_id) DO NOTHING`,
        userId,
        ctx.from?.first_name || 'User',
        ctx.from?.username || null
      );
    }

    logger.info({
      user_id: userId,
      web_user_id: linkToken.user_id,
      tier: targetUser.tier,
    }, 'Pairing successful');

    const tierDisplay = targetUser.tier === 'free' ? 'Free' : targetUser.tier.charAt(0).toUpperCase() + targetUser.tier.slice(1);

    await ctx.reply(
      '✅ **Pairing successful!**\n\n' +
      `Linked to: ${targetUser.email}\n` +
      `Subscription: ${tierDisplay}\n\n` +
      'Your subscription tier is now active in Telegram.\n' +
      'Use /login to start a chat session if you haven\'t already.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
    }, 'Pairing failed');

    await ctx.reply(
      '❌ **Pairing failed**\n\n' +
      'An unexpected error occurred. Please try again.',
      { parse_mode: 'Markdown' }
    );
  }
});

export default composer;
