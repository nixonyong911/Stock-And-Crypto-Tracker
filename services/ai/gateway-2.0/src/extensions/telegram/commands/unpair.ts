import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { PairingService } from "../../../core/pairing/service.js";

const composer = new Composer<TelegramBotContext>();
composer.command("unpair", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Error: Could not identify user.");
    return;
  }

  try {
    const pairing = new PairingService(
      ctx.gatewayAPI.db,
      ctx.gatewayAPI.logger,
      ctx.gatewayAPI.config
    );

    const result = await pairing.unpairChannel({
      platformUserId: String(userId),
      channelType: "telegram",
    });

    if (!result.success) {
      if (result.error === "not_paired") {
        await ctx.reply(
          "ℹ️ Your Telegram account is not currently paired to any web account.",
        );
      } else {
        await ctx.reply("❌ Unpairing failed. Please try again.");
      }
      return;
    }

    ctx.activeSession = null;
    await ctx.reply(
      "✅ **Account unpaired**\n\nYour Telegram account has been unlinked from your web account.\n\nYou can pair again anytime using /pair <6-digit code>.",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, "Unpair failed");
    await ctx.reply(
      "❌ **Unpairing failed**\n\nAn unexpected error occurred. Please try again.",
      { parse_mode: "Markdown" }
    );
  }
});
export default composer;
