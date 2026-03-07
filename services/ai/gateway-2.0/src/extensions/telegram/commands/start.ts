import { Composer, Keyboard } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { PairingService } from "../../../core/pairing/service.js";
import { hashPhone } from "../../../core/phone/hash.js";
import { COMMAND_MENU } from "../../commands/menu.js";

const PAIR_PAGE_URL = "https://stockandcryptotracker.com/pair";
const PHONE_VERIFY_PENDING_TTL = 600; // 10 minutes

const composer = new Composer<TelegramBotContext>();

// ── /start command ──────────────────────────────────────────────────────────

composer.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) {
    await ctx.reply("Error: Could not identify user.");
    return;
  }

  const db = ctx.gatewayAPI.db;

  const payload = ctx.match?.toString().trim() ?? "";
  const pairMatch = payload.match(/^pair_(\d{6})$/);
  const isVerifyPhone = payload === "verify_phone";

  // Ensure channel_accounts row exists
  const existing = await db.query(
    "SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
    [String(userId), "telegram"]
  );

  if (!existing.rows[0]) {
    try {
      await db.query(
        `INSERT INTO channel_accounts (channel_type, platform_user_id, platform_username, display_name)
         VALUES ($1, $2, $3, $4) ON CONFLICT (channel_type, platform_user_id) DO NOTHING`,
        [
          "telegram",
          String(userId),
          ctx.from?.username ?? null,
          ctx.from?.first_name ?? "User",
        ]
      );
      ctx.gatewayAPI.logger.info({ userId, chatId }, "User registered");
    } catch (err) {
      ctx.gatewayAPI.logger.error({ err, userId }, "Registration failed");
      await ctx.reply("Registration failed. Please try again later.");
      return;
    }
  }

  // ── Deep-link: verify_phone ───────────────────────────────────────────
  if (isVerifyPhone) {
    await handleVerifyPhone(ctx, userId);
    return;
  }

  // ── Deep-link: pair_XXXXXX ────────────────────────────────────────────
  if (pairMatch) {
    const deepLinkCode = pairMatch[1]!;
    const pairing = new PairingService(
      db,
      ctx.gatewayAPI.logger,
      ctx.gatewayAPI.config
    );

    const result = await pairing.pairChannel({
      code: deepLinkCode,
      platformUserId: String(userId),
      channelType: "telegram",
      platformUsername: ctx.from?.username,
      displayName: ctx.from?.first_name ?? "User",
    });

    if (result.success) {
      await pairing.createSession({
        platformUserId: String(userId),
        platformChatId: String(chatId),
        channelType: "telegram",
        clerkUserId: result.clerkUserId,
        deviceInfo: {
          language_code: ctx.from?.language_code,
          chat_type: ctx.chat?.type,
        },
      });

      const tierDisplay =
        String(result.tier).charAt(0).toUpperCase() +
        String(result.tier).slice(1);
      await ctx.reply(
        `✅ **Pairing successful!**\n\nLinked to: ${result.email}\nSubscription: ${tierDisplay}\n\nYou're logged in and ready to chat! Try asking:\n• "What are today's bullish stocks?"\n• "Show me pattern statistics for the week"\n\n${COMMAND_MENU}`,
        { parse_mode: "Markdown" }
      );

      // After successful pairing, request phone verification
      await requestPhoneVerification(ctx, userId);
      return;
    }

    if (result.error === "invalid_or_expired_code") {
      await ctx.reply(
        "⚠️ That pairing code has expired. Please generate a new one from the website."
      );
    } else if (result.error === "telegram_already_paired") {
      await ctx.reply(
        `⚠️ This Telegram account is already linked to ${result.email}.`
      );
    } else if (result.error === "web_already_paired") {
      await ctx.reply(
        "⚠️ That web account already has a Telegram account linked."
      );
    }
    return;
  }

  // ── Normal /start (no payload) ────────────────────────────────────────
  const isPaired = existing.rows[0]?.clerk_user_id != null;

  if (isPaired) {
    await ctx.reply(
      `👋 Welcome back, ${existing.rows[0].display_name}!\n\nUse /login to start a new session.\n\n${COMMAND_MENU}`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(
      `👋 **Welcome to Stock Tracker Bot!**\n\nTo get started, please pair your account:\n\n1. Visit: ${PAIR_PAGE_URL}\n2. Click **Pair Telegram Account**\n3. Click **Open in Telegram** — that's it!\n\nOr copy the 6-digit code and type:\n\`/pair <code>\``,
      { parse_mode: "Markdown" }
    );
  }
});

// ── message:contact handler ─────────────────────────────────────────────────

composer.on("message:contact", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const redis = ctx.gatewayAPI.redis;
  const pendingKey = `phone_verify_pending:${userId}`;
  const pending = await redis.get(pendingKey);
  if (!pending) return; // No pending phone verification request

  const contact = ctx.message.contact;

  // Validate: must be the user's own contact
  if (contact.user_id !== userId) {
    await ctx.reply("Please share your own phone number, not someone else's.");
    return;
  }

  if (!contact.phone_number) {
    await ctx.reply("Could not read phone number. Please try again.");
    return;
  }

  const phone = contact.phone_number.startsWith("+")
    ? contact.phone_number
    : `+${contact.phone_number}`;

  const salt = ctx.gatewayAPI.config.phoneHashSalt;
  if (!salt) {
    ctx.gatewayAPI.logger.error("PHONE_HASH_SALT is not configured");
    await ctx.reply("Phone verification is temporarily unavailable. Please try again later.");
    return;
  }

  const phoneHash = hashPhone(phone, salt);

  try {
    // Find the user record linked to this Telegram account
    const db = ctx.gatewayAPI.db;
    const { rows } = await db.query(
      "SELECT id FROM users WHERE telegram_user_id = $1",
      [userId]
    );

    if (!rows[0]) {
      await ctx.reply("Your Telegram account is not linked to a web account. Please pair first.");
      return;
    }

    // Store phone hash
    await db.query(
      "UPDATE users SET phone_hash = $1, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $2",
      [phoneHash, rows[0].id]
    );

    // Clear pending state
    await redis.del(pendingKey);

    await ctx.reply(
      "✅ Phone verified! You're all set.\n\nHead back to the website to start your free trial or subscribe.",
      { reply_markup: { remove_keyboard: true } }
    );

    ctx.gatewayAPI.logger.info(
      { userId, dbUserId: rows[0].id },
      "Phone verified via Telegram contact"
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, "Phone verification failed");
    await ctx.reply("Something went wrong verifying your phone. Please try again.");
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requestPhoneVerification(
  ctx: TelegramBotContext,
  telegramUserId: number
) {
  try {
    // Check if phone already verified
    const { rows } = await ctx.gatewayAPI.db.query(
      "SELECT phone_hash FROM users WHERE telegram_user_id = $1",
      [telegramUserId]
    );

    if (rows[0]?.phone_hash) return; // Already verified

    // Set pending state in Redis
    await ctx.gatewayAPI.redis.set(
      `phone_verify_pending:${telegramUserId}`,
      "pairing",
      "EX",
      PHONE_VERIFY_PENDING_TTL
    );

    const keyboard = new Keyboard()
      .requestContact("Share phone number to verify your account")
      .resized()
      .oneTime();

    await ctx.reply(
      "One more step — share your phone number to verify your account. " +
        "This helps us prevent trial abuse and is only used for verification.",
      { reply_markup: keyboard }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error(
      { err, telegramUserId },
      "Failed to request phone verification"
    );
  }
}

async function handleVerifyPhone(
  ctx: TelegramBotContext,
  telegramUserId: number
) {
  const db = ctx.gatewayAPI.db;

  // Check if paired
  const account = await db.query(
    "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = 'telegram'",
    [String(telegramUserId)]
  );

  if (!account.rows[0]?.clerk_user_id) {
    await ctx.reply(
      "Please pair your Telegram account first.\n\n" +
        `Visit: ${PAIR_PAGE_URL}`
    );
    return;
  }

  // Check if already verified
  const { rows } = await db.query(
    "SELECT phone_hash FROM users WHERE telegram_user_id = $1",
    [telegramUserId]
  );

  if (rows[0]?.phone_hash) {
    await ctx.reply(
      "✅ Your phone is already verified! Head back to the website to start your trial."
    );
    return;
  }

  // Set pending state and send keyboard
  await ctx.gatewayAPI.redis.set(
    `phone_verify_pending:${telegramUserId}`,
    "verify_phone",
    "EX",
    PHONE_VERIFY_PENDING_TTL
  );

  const keyboard = new Keyboard()
    .requestContact("Share phone number to verify")
    .resized()
    .oneTime();

  await ctx.reply(
    "Share your phone number to verify your account and unlock the free trial.",
    { reply_markup: keyboard }
  );
}

export default composer;
