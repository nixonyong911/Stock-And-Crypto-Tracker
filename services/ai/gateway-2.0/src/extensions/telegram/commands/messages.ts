import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { splitMessage } from "../utils.js";
import { Tier } from "../../../extension/types.js";

/** Hard ceiling to prevent indefinite hangs. */
const MAX_PROCESSING_MS = 5 * 60 * 1000;

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
]);

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
      // Don't retry usage/security/keyword blocks — they'll fail the same way
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
      await ctx.reply(
        "⚠️ You've used all your free messages. Upgrade to Pro for unlimited access."
      );
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
