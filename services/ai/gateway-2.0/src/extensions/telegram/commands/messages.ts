import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { splitMessage } from "../utils.js";
import { Tier } from "../../../extension/types.js";

/**
 * Known Telegram bot commands. Any slash command not in this set
 * is either rejected (non-DEV) or passed through (DEV only).
 */
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
]);

const composer = new Composer<TelegramBotContext>();

composer.on("message:text", async (ctx) => {
  const messageText = ctx.message.text;

  // --- Slash command guard ---------------------------------------------------
  // Known commands are handled by their own grammy composers (registered before
  // this handler). If we reach here with a "/" message, it's either an unknown
  // command or the grammy composer didn't match (shouldn't happen for known).
  if (messageText.startsWith("/")) {
    const cmd = messageText.slice(1).split(/[\s@]/)[0]?.toLowerCase() ?? "";

    if (KNOWN_COMMANDS.has(cmd)) {
      // Known command that grammy should have already handled — do nothing.
      return;
    }

    // Unknown slash command — allow through only for DEV tier users
    const userId = ctx.from?.id;
    if (userId) {
      try {
        const tier = await ctx.gatewayAPI.resolveUserTier(
          String(userId),
          "telegram"
        );
        if (tier === Tier.Dev) {
          // DEV users can pass arbitrary commands to the CLI — fall through
          // to normal message processing below.
        } else {
          await ctx.reply(
            "Unknown command. Use /help to see available commands."
          );
          return;
        }
      } catch {
        // If tier resolution fails, err on the side of safety
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

  // Enforce pairing: unpaired users can't send messages
  const accountResult = await ctx.gatewayAPI.db.query(
    "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
    [String(userId), "telegram"]
  );
  const isPaired = accountResult.rows[0]?.clerk_user_id != null;

  if (!isPaired) {
    await ctx.reply(
      "🔗 **Account not paired**\n\nPlease pair your Telegram account first:\n\n1. Visit: https://stockandcryptotracker.com/pair\n2. Click **Pair Telegram Account**\n3. Click **Open in Telegram**\n\nOr use `/pair <6-digit code>`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (!ctx.activeSession) {
    await ctx.reply(
      "🔒 **Please login first**\n\nUse /login to start a session.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const session = ctx.activeSession;

  // Enqueue the message — the queue handles position feedback and FIFO processing
  try {
    const chunks = await ctx.messageQueue.enqueue(
      chatId,
      userId,
      messageText,
      async (): Promise<string[]> => {
        // This runs when it's this message's turn in the queue
        const result = await ctx.gatewayAPI.processMessage({
          channelType: "telegram",
          platformUserId: String(userId),
          platformChatId: String(chatId),
          message: messageText,
          metadata: { cliSessionId: session.cliSessionId },
        });
        return splitMessage(result.response);
      }
    );

    // Send the response chunks
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(chunk); // Fallback to plain text
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg.includes("sensitive_keyword")) {
      await ctx.reply(
        "⚠️ Unable to process your request due to sensitive keyword detected. Please rephrase and try again."
      );
    } else if (errMsg.includes("No messages remaining")) {
      await ctx.reply(
        `⚠️ ${errMsg}\n\nUpgrade to Pro for unlimited messages.`,
        { parse_mode: "Markdown" }
      );
    } else if (errMsg.includes("blocked")) {
      await ctx.reply(
        "⚠️ Your message was blocked by our safety system. Please rephrase your request."
      );
    } else if (errMsg.includes("queue full")) {
      await ctx.reply(
        "⚠️ Too many messages queued. Please wait for your current messages to finish."
      );
    } else if (errMsg.includes("Queue cleared")) {
      // Shutdown — silently ignore
    } else {
      ctx.gatewayAPI.logger.error({ err, userId }, "Message processing failed");
      await ctx.reply(
        "⚠️ **Something went wrong**\n\nUnable to process your request. Please try again.\n\nIf this persists, use /refresh to reset your conversation.",
        { parse_mode: "Markdown" }
      );
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
