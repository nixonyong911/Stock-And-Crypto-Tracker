import { Composer } from "grammy";
import type { BotContext } from "../types/context.js";
import { logger } from "../middleware/index.js";
import { getGatewayClient } from "../services/gateway-client.js";
import { splitMessage } from "../utils/message-splitter.js";

const composer = new Composer<BotContext>();

/**
 * Handle regular text messages (not commands)
 */
composer.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const messageText = ctx.message.text;

  // Skip commands
  if (messageText.startsWith("/")) {
    return;
  }

  if (!userId || !chatId) {
    await ctx.reply("Error: Could not identify user.");
    return;
  }

  // Check for active session
  if (!ctx.telegramSession) {
    await ctx.reply(
      "🔒 **Please login first**\n\n" +
        "Use /login to start a session.\n\n" +
        "Not registered? Use /start to register!",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Update last active
  try {
    await ctx.db.execute(
      `UPDATE telegram_sessions
       SET last_active_at = NOW()
       WHERE telegram_user_id = $1 AND telegram_chat_id = $2`,
      userId,
      chatId
    );
  } catch {
    // Ignore update errors
  }

  // Resolve user tier (default to free if not linked to Clerk)
  const tier = await resolveUserTier(ctx);

  // Call Gateway
  const gateway = getGatewayClient();
  const sessionId = ctx.telegramSession.cursor_chat_id;

  logger.info(
    {
      user_id: userId,
      tier,
      message_length: messageText.length,
      cursor_chat_id: sessionId,
    },
    "Processing AI request via Gateway"
  );

  try {
    const result = await gateway.chatWithProgress(
      ctx.api,
      chatId,
      messageText,
      String(userId),
      tier,
      sessionId
    );

    // Update cursor_chat_id if Gateway returned a new session
    if (result.sessionId && result.sessionId !== sessionId) {
      try {
        await ctx.db.execute(
          `UPDATE telegram_sessions SET cursor_chat_id = $1
           WHERE telegram_user_id = $2 AND telegram_chat_id = $3`,
          result.sessionId,
          userId,
          chatId
        );
      } catch {
        // Ignore session update errors
      }
    }

    // Split long responses
    const chunks = splitMessage(result.response);

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      } catch {
        // If Markdown fails, try plain text
        await ctx.reply(chunk);
      }
    }

    logger.info(
      {
        user_id: userId,
        response_length: result.response.length,
        chunks: chunks.length,
        tier,
      },
      "AI response sent"
    );
  } catch (error) {
    logger.error(
      {
        error: (error as Error).message,
        user_id: userId,
      },
      "Gateway request failed"
    );

    await ctx.reply(
      "⚠️ **Something went wrong**\n\n" +
        "Unable to process your request. Please try again.\n\n" +
        "If this persists, use /refresh to reset your conversation.",
      { parse_mode: "Markdown" }
    );
  }
});

/**
 * Resolve user tier from database.
 * Checks if telegram user is linked to a Clerk user with a subscription.
 * Falls back to "free" if not linked.
 */
async function resolveUserTier(ctx: BotContext): Promise<string> {
  try {
    const user = await ctx.db.fetchOne<{ tier: string }>(
      `SELECT tier FROM users WHERE telegram_user_id = $1`,
      ctx.from!.id
    );

    if (user?.tier) {
      return user.tier;
    }
  } catch {
    // If query fails (user not paired yet), default to free
  }

  return "free";
}

/**
 * Handle unknown commands
 */
composer.on("message", async (ctx) => {
  // This catches any other message types (photos, stickers, etc.)
  await ctx.reply(
    "❓ I can only process text messages.\n\n" +
      "Use /help to see available commands.",
    { parse_mode: "Markdown" }
  );
});

export default composer;
