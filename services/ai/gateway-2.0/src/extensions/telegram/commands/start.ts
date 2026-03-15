import { Composer, InlineKeyboard, Keyboard } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { PairingService } from "../../../core/pairing/service.js";
import { hashPhone } from "../../../core/phone/hash.js";
import { COMMAND_MENU } from "../../commands/menu.js";

const PAIR_PAGE_URL = "https://stockandcryptotracker.com/pair";
const PRICING_URL = "https://stockandcryptotracker.com/pricing";
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

      await ctx.reply(
        "Set your timezone for localized market times: /timezone",
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

    // Clear pending state + invalidate cached trial status
    await redis.del(pendingKey);
    redis.del(`trial:status:${userId}`).catch(() => {});
    redis.del(`quota:reply:${userId}`).catch(() => {});

    ctx.gatewayAPI.logger.info(
      { userId, dbUserId: rows[0].id },
      "Phone verified via Telegram contact"
    );

    // Check if there's a trial intent (user was trying to start a trial)
    const intentKey = `trial:intent:${userId}`;
    let hasTrialIntent = false;
    try {
      const intent = await redis.get(intentKey);
      hasTrialIntent = intent === "1";
    } catch {
      // Non-critical
    }

    if (hasTrialIntent) {
      // Attempt to auto-start the trial via the internal frontend endpoint
      const trialStarted = await attemptAutoTrialStart(ctx, userId);
      try { await redis.del(intentKey); } catch { /* Non-critical */ }

      if (trialStarted) {
        await ctx.reply(
          "✅ Phone verified! Your **7-day Pro trial** is now active! Enjoy unlimited access.",
          { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
        );
      } else {
        // Fallback: show inline button to start trial manually
        const keyboard = new InlineKeyboard().url("Start Free Trial", PRICING_URL);
        await ctx.reply(
          "✅ Phone verified!\n\n🎉 You're now eligible for a free 7-day Pro trial!",
          { parse_mode: "Markdown", reply_markup: keyboard }
        );
      }
    } else {
      await ctx.reply(
        "✅ Phone verified! You're all set.",
        { reply_markup: { remove_keyboard: true } }
      );
    }
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
      "Please share your phone number to verify your account.",
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
    // Phone already verified — check if trial intent exists and try auto-start
    const redis = ctx.gatewayAPI.redis;
    const intentKey = `trial:intent:${telegramUserId}`;
    let hasTrialIntent = false;
    try {
      const intent = await redis.get(intentKey);
      hasTrialIntent = intent === "1";
    } catch { /* Non-critical */ }

    if (hasTrialIntent) {
      const trialStarted = await attemptAutoTrialStart(ctx, telegramUserId);
      try { await redis.del(intentKey); } catch { /* Non-critical */ }

      if (trialStarted) {
        await ctx.reply(
          "✅ Your phone is already verified! Your **7-day Pro trial** is now active!",
          { parse_mode: "Markdown" }
        );
      } else {
        const keyboard = new InlineKeyboard().url("Start Free Trial", PRICING_URL);
        await ctx.reply(
          "✅ Your phone is already verified!\n\n🎉 You're eligible for a free trial!",
          { parse_mode: "Markdown", reply_markup: keyboard }
        );
      }
    } else {
      // No trial intent — check trial eligibility for a helpful CTA
      try {
        const trialCheck = await db.query(
          `SELECT tc.id AS trial_claim_id
           FROM users u
           LEFT JOIN trial_claims tc ON tc.user_id = u.id
           WHERE u.telegram_user_id = $1
           LIMIT 1`,
          [telegramUserId]
        );
        if (trialCheck.rows[0] && !trialCheck.rows[0].trial_claim_id) {
          const keyboard = new InlineKeyboard().url("Start Free Trial", PRICING_URL);
          await ctx.reply(
            "✅ Your phone is already verified!\n\n🎉 You're eligible for a free 7-day Pro trial!",
            { parse_mode: "Markdown", reply_markup: keyboard }
          );
        } else {
          const keyboard = new InlineKeyboard().url("View Plans & Pricing", PRICING_URL);
          await ctx.reply(
            "✅ Your phone is already verified! Check out our plans:",
            { reply_markup: keyboard }
          );
        }
      } catch {
        await ctx.reply(
          "✅ Your phone is already verified! Use /subscribe to view plans."
        );
      }
    }
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

// ---------------------------------------------------------------------------
// Internal trial auto-start helper
// ---------------------------------------------------------------------------

async function attemptAutoTrialStart(
  ctx: TelegramBotContext,
  telegramUserId: number
): Promise<boolean> {
  const { frontendUrl, internalServiceKey } = ctx.gatewayAPI.config;
  if (!internalServiceKey) {
    ctx.gatewayAPI.logger.warn("INTERNAL_SERVICE_KEY not configured, skipping auto trial start");
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const resp = await fetch(`${frontendUrl}/api/internal/trial/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": internalServiceKey,
      },
      body: JSON.stringify({ telegram_user_id: String(telegramUserId) }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (resp.ok) {
      ctx.gatewayAPI.logger.info(
        { telegramUserId },
        "Trial auto-started via internal endpoint"
      );
      return true;
    }

    const body = await resp.json().catch(() => ({}));
    ctx.gatewayAPI.logger.warn(
      { telegramUserId, status: resp.status, reason: (body as Record<string, unknown>).reason },
      "Internal trial start returned non-OK"
    );
    return false;
  } catch (err) {
    ctx.gatewayAPI.logger.error(
      { err, telegramUserId },
      "Failed to call internal trial start endpoint"
    );
    return false;
  }
}

export default composer;
