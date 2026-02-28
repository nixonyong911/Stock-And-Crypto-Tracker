import { Composer } from "grammy";
import crypto from "node:crypto";
import type { TelegramBotContext } from "../bot.js";
import { deleteSessionFromCache } from "../../../core/session/cache.js";
import { COMMAND_MENU } from "../../commands/menu.js";

const composer = new Composer<TelegramBotContext>();
composer.command("refresh", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Error: Could not identify user.");
    return;
  }
  if (!ctx.activeSession) {
    await ctx.reply(
      "❌ You are not logged in.\n\nUse /login to start a session first."
    );
    return;
  }

  try {
    const newCliSessionId = crypto.randomUUID();

    const currentTier = await ctx.gatewayAPI.resolveUserTier(
      String(userId),
      "telegram"
    );

    const oldTier = ctx.activeSession.tier;
    const tierChanged = oldTier !== currentTier;

    await ctx.gatewayAPI.db.query(
      `UPDATE gateway_sessions
         SET cli_session_id = $1
       WHERE platform_user_id = $2 AND channel_type = $3 AND expires_at > NOW()`,
      [newCliSessionId, String(userId), "telegram"]
    );

    await deleteSessionFromCache(
      ctx.gatewayAPI.redis,
      "telegram",
      String(userId)
    );

    ctx.gatewayAPI.logger.info(
      {
        userId,
        oldId: ctx.activeSession.cliSessionId,
        newId: newCliSessionId,
        oldTier,
        newTier: currentTier,
      },
      "CLI session refreshed"
    );

    const tierMsg = tierChanged
      ? `\n\n📋 Your tier has been updated: *${oldTier}* → *${currentTier}*`
      : "";

    await ctx.reply(
      `🔄 **Fresh conversation started!**\n\nYour previous chat session has been cleared. You can now start a new conversation.${tierMsg}\n\n${COMMAND_MENU}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, "Refresh failed");
    await ctx.reply("❌ Failed to refresh. Please try again later.");
  }
});
export default composer;
