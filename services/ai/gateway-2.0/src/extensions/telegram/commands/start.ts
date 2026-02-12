import { Composer } from 'grammy';
import type { TelegramBotContext } from '../bot.js';
import { PairingService } from '../../../core/pairing/service.js';

const PAIR_PAGE_URL = 'https://stockandcryptotracker.com/pair';

const composer = new Composer<TelegramBotContext>();

composer.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) { await ctx.reply('Error: Could not identify user.'); return; }

  const db = ctx.gatewayAPI.db;

  // Check for deep-link payload: /start pair_123456
  const payload = ctx.match?.toString().trim() ?? '';
  const pairMatch = payload.match(/^pair_(\d{6})$/);

  // Check if user exists in channel_accounts
  const existing = await db.query(
    'SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2',
    [String(userId), 'telegram']
  );

  if (!existing.rows[0]) {
    // Register new channel account (no clerk_user_id yet — that comes from pairing)
    try {
      await db.query(
        `INSERT INTO channel_accounts (channel_type, platform_user_id, platform_username, display_name)
         VALUES ($1, $2, $3, $4) ON CONFLICT (channel_type, platform_user_id) DO NOTHING`,
        ['telegram', String(userId), ctx.from?.username ?? null, ctx.from?.first_name ?? 'User']
      );
      ctx.gatewayAPI.logger.info({ userId, chatId }, 'User registered');
    } catch (err) {
      ctx.gatewayAPI.logger.error({ err, userId }, 'Registration failed');
      await ctx.reply('Registration failed. Please try again later.');
      return;
    }
  }

  // Handle deep-link auto-pair
  if (pairMatch) {
    const deepLinkCode = pairMatch[1]!;
    const pairing = new PairingService(db, ctx.gatewayAPI.logger, ctx.gatewayAPI.config);

    const result = await pairing.pairChannel({
      code: deepLinkCode,
      platformUserId: String(userId),
      channelType: 'telegram',
      platformUsername: ctx.from?.username,
      displayName: ctx.from?.first_name ?? 'User',
    });

    if (result.success) {
      // Auto-create a session after pairing
      await pairing.createSession({
        platformUserId: String(userId),
        platformChatId: String(chatId),
        channelType: 'telegram',
        clerkUserId: result.clerkUserId,
        tier: result.tier!,
        deviceInfo: { language_code: ctx.from?.language_code, chat_type: ctx.chat?.type },
      });

      const tierDisplay = String(result.tier).charAt(0).toUpperCase() + String(result.tier).slice(1);
      await ctx.reply(
        `✅ **Pairing successful!**\n\nLinked to: ${result.email}\nSubscription: ${tierDisplay}\n\nYou're logged in and ready to chat! Try asking:\n• "What are today's bullish stocks?"\n• "Show me pattern statistics for the week"`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Pair failed — show error but continue to normal welcome
    if (result.error === 'invalid_or_expired_code') {
      await ctx.reply('⚠️ That pairing code has expired. Please generate a new one from the website.');
    } else if (result.error === 'telegram_already_paired') {
      await ctx.reply(`⚠️ This Telegram account is already linked to ${result.email}.`);
    } else if (result.error === 'web_already_paired') {
      await ctx.reply('⚠️ That web account already has a Telegram account linked.');
    }
    return;
  }

  // Check if paired
  const isPaired = existing.rows[0]?.clerk_user_id != null;

  if (isPaired) {
    await ctx.reply(
      `👋 Welcome back, ${existing.rows[0].display_name}!\n\nUse /login to start a new session.\nUse /help to see available commands.`
    );
  } else {
    // Not paired — redirect to website
    await ctx.reply(
      `👋 **Welcome to Stock Tracker Bot!**\n\nTo get started, please pair your account:\n\n1. Visit: ${PAIR_PAGE_URL}\n2. Click **Pair Telegram Account**\n3. Click **Open in Telegram** — that's it!\n\nOr copy the 6-digit code and type:\n\`/pair <code>\``,
      { parse_mode: 'Markdown' }
    );
  }
});

export default composer;
