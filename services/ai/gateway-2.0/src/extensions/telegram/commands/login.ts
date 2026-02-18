import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { PairingService } from "../../../core/pairing/service.js";

const composer = new Composer<TelegramBotContext>();
composer.command("login", async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) {
    await ctx.reply("Error: Could not identify user.");
    return;
  }

  // Check if registered in channel_accounts
  const account = await ctx.gatewayAPI.db.query(
    "SELECT * FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
    [String(userId), "telegram"]
  );
  if (!account.rows[0]) {
    await ctx.reply(
      "❌ You are not registered.\n\nUse /start to register first."
    );
    return;
  }

  // Enforce pairing
  if (!account.rows[0].clerk_user_id) {
    await ctx.reply(
      "🔗 **Account not paired**\n\nPlease pair your Telegram account first:\n\n1. Visit: https://stockandcryptotracker.com/pair\n2. Click **Pair Telegram Account**\n3. Click **Open in Telegram**\n\nOr use `/pair <6-digit code>`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  try {
    const pairing = new PairingService(
      ctx.gatewayAPI.db,
      ctx.gatewayAPI.logger,
      ctx.gatewayAPI.config
    );
    await pairing.createSession({
      platformUserId: String(userId),
      platformChatId: String(chatId),
      channelType: "telegram",
      clerkUserId: account.rows[0].clerk_user_id,
      deviceInfo: {
        language_code: ctx.from?.language_code,
        chat_type: ctx.chat?.type,
        is_bot: ctx.from?.is_bot,
      },
    });

    const tier = await pairing.resolveUserTier(String(userId), "telegram");
    ctx.gatewayAPI.logger.info({ userId, tier }, "User logged in");
    await ctx.reply(
      `✅ **Logged in successfully!**\n\nWelcome back, ${
        account.rows[0].display_name
      }!\n\nTier: ${
        String(tier).charAt(0).toUpperCase() + String(tier).slice(1)
      }\nSession valid for ${
        ctx.telegramConfig.sessionExpiryDays
      } days.\n\nAny previous sessions have been logged out.\n\nYou can now ask me financial questions!`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, "Login failed");
    await ctx.reply("❌ Login failed. Please try again later.");
  }
});
export default composer;
