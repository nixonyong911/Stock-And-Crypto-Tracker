import { Composer } from "grammy";
import crypto from "node:crypto";
import type { TelegramBotContext } from "../bot.js";

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

    // Re-resolve the user's current tier from the database.
    // This picks up any upgrades/downgrades since the session was created.
    const currentTier = await ctx.gatewayAPI.resolveUserTier(
      String(userId),
      "telegram"
    );

    const oldTier = ctx.activeSession.tier;
    const tierChanged = oldTier !== currentTier;

    await ctx.gatewayAPI.db.query(
      `UPDATE gateway_sessions
         SET cli_session_id = $1, tier = $2
       WHERE platform_user_id = $3 AND channel_type = $4 AND expires_at > NOW()`,
      [newCliSessionId, currentTier, String(userId), "telegram"]
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
      `🔄 **Conversation context refreshed!**\n\nYour AI conversation has been reset.\nPrevious context has been cleared. You can now start a fresh conversation.${tierMsg}`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, "Refresh failed");
    await ctx.reply("❌ Failed to refresh. Please try again later.");
  }
});
export default composer;
