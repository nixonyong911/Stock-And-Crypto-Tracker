import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { splitMessage } from "../utils.js";
import { Tier } from "../../../extension/types.js";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";

/** Hard ceiling to prevent indefinite hangs. */
const MAX_PROCESSING_MS = 5 * 60 * 1000;

const PRICING_URL = "https://stockandcryptotracker.com/pricing";
const TRIAL_STATUS_TTL = 3600; // 1 hour
const TRIAL_INTENT_TTL = 1800; // 30 minutes
const MAX_QUOTA_REPLY_TTL = 300; // 5 minutes

const KNOWN_COMMANDS = new Set([
  "start",
  "help",
  "menu",
  "login",
  "logout",
  "refresh",
  "status",
  "pair",
  "add",
  "remove",
  "addhelp",
  "helpadd",
  "removehelp",
  "helpremove",
  "unpair",
  "wishlist",
  "watchlist",
  "subscribe",
  "alert",
  "track",
  "alertlist",
  "tracklist",
  "alertremove",
  "trackremove",
]);

// ---------------------------------------------------------------------------
// Trial / phone status helpers
// ---------------------------------------------------------------------------

interface TrialStatus {
  phoneVerified: boolean;
  trialUsed: boolean;
}

async function getTrialStatus(
  redis: Redis,
  db: Pool,
  logger: FastifyBaseLogger,
  platformUserId: string
): Promise<TrialStatus> {
  const cacheKey = `trial:status:${platformUserId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TrialStatus;
    }
  } catch {
    // Cache miss or parse error — fall through to DB
  }

  try {
    const result = await db.query(
      `SELECT u.phone_hash, tc.id AS trial_claim_id
       FROM channel_accounts ca
       JOIN users u ON u.clerk_user_id = ca.clerk_user_id
       LEFT JOIN trial_claims tc ON tc.user_id = u.id
       WHERE ca.platform_user_id = $1 AND ca.channel_type = 'telegram'
       LIMIT 1`,
      [platformUserId]
    );

    const row = result.rows[0];
    if (!row) {
      return { phoneVerified: false, trialUsed: true };
    }

    const status: TrialStatus = {
      phoneVerified: row.phone_hash != null,
      trialUsed: row.trial_claim_id != null,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(status), "EX", TRIAL_STATUS_TTL);
    } catch {
      // Non-critical
    }

    return status;
  } catch (err) {
    logger.error({ err, platformUserId }, "Failed to query trial status");
    return { phoneVerified: true, trialUsed: true };
  }
}

// ---------------------------------------------------------------------------
// Quota-exceeded reply builder
// ---------------------------------------------------------------------------

function formatRechargeCountdown(errMsg: string): string {
  const isoMatch = errMsg.match(/Next recharge:\s*(\d{4}-[^)]+Z?)/);
  if (!isoMatch?.[1]) return "";

  const rechargeAt = new Date(isoMatch[1]);
  const diffMs = rechargeAt.getTime() - Date.now();
  if (diffMs <= 0) return "";

  const mins = Math.ceil(diffMs / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return `\n\n🕐 Your next free message will be available in **${parts.join(" ")}**.`;
}

function getRechargeSecondsFromError(errMsg: string): number {
  const isoMatch = errMsg.match(/Next recharge:\s*(\d{4}-[^)]+Z?)/);
  if (!isoMatch?.[1]) return MAX_QUOTA_REPLY_TTL;

  const rechargeAt = new Date(isoMatch[1]);
  const diffSec = Math.ceil((rechargeAt.getTime() - Date.now()) / 1000);
  if (diffSec <= 0) return 1;
  return Math.min(diffSec, MAX_QUOTA_REPLY_TTL);
}

function buildQuotaReply(
  rechargeNote: string,
  trialStatus: TrialStatus
): string {
  const header = "⚠️ You've used all your free messages.";

  if (!trialStatus.phoneVerified && !trialStatus.trialUsed) {
    return (
      `${header}${rechargeNote}` +
      `\n\n📱 Verify your phone to unlock a free 7-day Pro trial!` +
      `\nTap here → /start verify\\_phone` +
      `\nOr use /subscribe to view plans.`
    );
  }

  if (!trialStatus.trialUsed) {
    return (
      `${header}${rechargeNote}` +
      `\n\n👉 [Start your free 7-day Pro trial](${PRICING_URL})` +
      `\nOr use /subscribe to view plans.`
    );
  }

  return (
    `${header}${rechargeNote}` +
    `\n\n👉 [Subscribe to Pro](${PRICING_URL}) for unlimited access.` +
    `\nOr use /subscribe to view plans.`
  );
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

const composer = new Composer<TelegramBotContext>();

composer.on("message:text", async (ctx) => {
  const messageText = ctx.message.text;

  // --- Slash command guard ---------------------------------------------------
  if (messageText.startsWith("/")) {
    const cmd = messageText.slice(1).split(/[\s@]/)[0]?.toLowerCase() ?? "";

    if (KNOWN_COMMANDS.has(cmd)) {
      return;
    }

    const userId = ctx.from?.id;
    if (userId) {
      try {
        const tier = await ctx.gatewayAPI.resolveUserTier(
          String(userId),
          "telegram"
        );
        if (tier !== Tier.Dev) {
          await ctx.reply(
            "Unknown command. Use /help to see available commands."
          );
          return;
        }
      } catch {
        await ctx.reply(
          "Unknown command. Use /help to see available commands."
        );
        return;
      }
    } else {
      await ctx.reply("Unknown command. Use /help to see available commands.");
      return;
    }
  }

  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) {
    await ctx.reply("Error: Could not identify user.");
    return;
  }

  // --- Account pairing check ------------------------------------------------
  let isPaired = false;
  try {
    const accountResult = await ctx.gatewayAPI.db.query(
      "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
      [String(userId), "telegram"]
    );
    isPaired = accountResult.rows[0]?.clerk_user_id != null;
  } catch (err) {
    ctx.gatewayAPI.logger.error(
      { err, userId },
      "Failed to check account pairing"
    );
    await ctx.reply("⚠️ Something went wrong. Please try again.");
    return;
  }

  if (!isPaired) {
    await ctx.reply(
      "🔗 **Account not paired**\n\nPlease pair your Telegram account first:\n\n1. Visit: https://stockandcryptotracker.com/pair\n2. Click **Pair Telegram Account**\n3. Click **Open in Telegram**\n\nOr use `/pair <6-digit code>`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (!ctx.activeSession) {
    if (ctx.sessionLoadFailed) {
      await ctx.reply("Something went wrong checking your session. Please try again.");
    } else {
      await ctx.reply(
        "🔒 **Please login first**\n\nUse /login to start a session.",
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // --- Cached quota-exceeded reply (short-circuit for spam protection) ------
  const quotaCacheKey = `quota:reply:${userId}`;
  try {
    const cachedReply = await ctx.gatewayAPI.redis.get(quotaCacheKey);
    if (cachedReply) {
      try {
        await ctx.reply(cachedReply, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(cachedReply);
      }
      return;
    }
  } catch {
    // Redis error — continue normally
  }

  const session = ctx.activeSession;

  // --- Send immediate "Processing..." indicator -----------------------------
  let statusMsgId: number | undefined;
  try {
    const statusMsg = await ctx.reply("⏳ Processing your request...");
    statusMsgId = statusMsg.message_id;
  } catch {
    // Non-critical — continue without indicator
  }

  // --- Helper: mark dedup status --------------------------------------------
  const markDedup = (status: "completed" | "failed"): void => {
    if (!ctx.dedupKey) return;
    if (status === "completed") {
      ctx.gatewayAPI.redis
        .set(ctx.dedupKey, "completed", "EX", 600)
        .catch(() => {});
    } else {
      ctx.gatewayAPI.redis.del(ctx.dedupKey).catch(() => {});
    }
  };

  // --- Helper: call processMessage with one auto-retry ----------------------
  const callWithRetry = async (): Promise<string[]> => {
    const invoke = () =>
      ctx.gatewayAPI.processMessage({
        channelType: "telegram",
        platformUserId: String(userId),
        platformChatId: String(chatId),
        message: messageText,
        metadata: { cliSessionId: session.cliSessionId },
      });

    try {
      const result = await invoke();
      return splitMessage(result.response);
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : "";
      if (
        msg.includes("sensitive_keyword") ||
        msg.includes("No messages remaining") ||
        msg.includes("blocked") ||
        msg.includes("queue full")
      ) {
        throw firstErr;
      }

      ctx.gatewayAPI.logger.warn(
        { err: firstErr, userId },
        "First attempt failed — retrying once"
      );

      const result = await invoke();
      return splitMessage(result.response);
    }
  };

  // --- Enqueue + timeout race -----------------------------------------------
  try {
    const processingPromise = ctx.messageQueue.enqueue(
      chatId,
      userId,
      messageText,
      callWithRetry,
      statusMsgId
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("processing_timeout")),
        MAX_PROCESSING_MS
      )
    );

    const chunks = await Promise.race([processingPromise, timeoutPromise]);

    markDedup("completed");

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(chunk);
      }
    }
  } catch (err) {
    markDedup("failed");

    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.gatewayAPI.logger.error({ err, userId }, "Message processing failed");

    if (errMsg.includes("sensitive_keyword")) {
      await ctx.reply(
        "⚠️ Your request contained a restricted keyword. Please rephrase and try again."
      );
    } else if (errMsg.includes("No messages remaining")) {
      const rechargeNote = formatRechargeCountdown(errMsg);
      const trialStatus = await getTrialStatus(
        ctx.gatewayAPI.redis,
        ctx.gatewayAPI.db,
        ctx.gatewayAPI.logger,
        String(userId)
      );

      const reply = buildQuotaReply(rechargeNote, trialStatus);

      // Set trial intent if user needs phone verification first
      if (!trialStatus.phoneVerified && !trialStatus.trialUsed) {
        try {
          await ctx.gatewayAPI.redis.set(
            `trial:intent:${userId}`,
            "1",
            "EX",
            TRIAL_INTENT_TTL
          );
        } catch {
          // Non-critical
        }
      }

      // Cache the composed reply to short-circuit spam
      try {
        const ttl = getRechargeSecondsFromError(errMsg);
        await ctx.gatewayAPI.redis.set(quotaCacheKey, reply, "EX", ttl);
      } catch {
        // Non-critical
      }

      try {
        await ctx.reply(reply, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(reply);
      }
    } else {
      await ctx.reply("⚠️ Something went wrong. Please try again.");
    }
  }
});

// Handle non-text messages
composer.on("message", async (ctx) => {
  await ctx.reply(
    "❓ I can only process text messages.\n\nUse /help to see available commands."
  );
});

export default composer;
