import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";

const composer = new Composer<TelegramBotContext>();

composer.command(["alertlist", "tracklist"], async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  const accountResult = await ctx.gatewayAPI.db.query(
    "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
    [String(userId), "telegram"]
  );
  const isPaired = accountResult.rows[0]?.clerk_user_id != null;

  if (!isPaired) {
    await ctx.reply(
      "You need to pair your account first. Visit https://stockandcryptotracker.com/pair to get started.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (!ctx.activeSession) {
    if (ctx.sessionLoadFailed) {
      await ctx.reply("Something went wrong checking your session. Please try again.");
    } else {
      await ctx.reply("Please login first with /login.", { parse_mode: "Markdown" });
    }
    return;
  }

  const clerkUserId = ctx.activeSession.clerkUserId;
  if (!clerkUserId) {
    await ctx.reply("Account not linked. Please re-pair your account.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;

  try {
    const result = await db.query(
      `SELECT ticker_symbol, asset_type, target_price, created_at
       FROM user_price_alerts
       WHERE clerk_user_id = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [clerkUserId]
    );

    if (result.rows.length === 0) {
      await ctx.reply("You have no active alerts. Use /alert to set one.");
      return;
    }

    const lines = result.rows.map((row: { ticker_symbol: string; asset_type: string; target_price: string; created_at: Date }) => {
      const symbol = row.asset_type === "crypto"
        ? row.ticker_symbol.split("/")[0]!
        : row.ticker_symbol;
      const price = parseFloat(row.target_price).toFixed(2);
      const date = new Date(row.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return `• ${symbol} — $${price} _(${row.asset_type}, set ${date})_`;
    });

    const header = `**Active Alerts (${result.rows.length}):**\n`;
    await ctx.reply(header + lines.join("\n"), { parse_mode: "Markdown" });
  } catch (err) {
    logger.error({ err, userId }, "Error in /alertlist command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
});

export default composer;
