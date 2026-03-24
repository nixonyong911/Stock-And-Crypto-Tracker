import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { notifyError } from "../utils.js";

const SYMBOL_REGEX = /^[A-Za-z0-9/\-.]+$/;

const USAGE_TEXT = [
  "**Usage:** `/remove <symbol>`",
  "",
  "**Examples:**",
  "`/remove AAPL` — remove a stock",
  "`/remove BTC` — remove a cryptocurrency",
].join("\n");

function normalizeCryptoSymbol(symbol: string): string {
  symbol = symbol.toUpperCase().trim();
  if (!symbol.includes("/")) {
    symbol = `${symbol}/USD`;
  }
  return symbol;
}

const composer = new Composer<TelegramBotContext>();

composer.command("remove", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  // Auth guard
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
      await notifyError(
        ctx,
        new Error("Session middleware failed to load session"),
        "/remove — Session load failed",
        "Something went wrong checking your session. Please try again.",
      );
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

  // Parse arguments: /remove <symbol>
  const rawArgs = (ctx.match?.toString() ?? "").trim();
  if (!rawArgs) {
    await ctx.reply(USAGE_TEXT, { parse_mode: "Markdown" });
    return;
  }

  const rawSymbol = rawArgs.split(/\s+/)[0]!;

  if (!SYMBOL_REGEX.test(rawSymbol)) {
    await ctx.reply(
      `Invalid symbol format.\n\n${USAGE_TEXT}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;

  // Try both the raw symbol (stock/ETF) and crypto-normalized form
  const upperSymbol = rawSymbol.toUpperCase().trim();
  const cryptoSymbol = normalizeCryptoSymbol(rawSymbol);
  const displaySymbol = upperSymbol;

  try {
    // Attempt delete with the exact symbol first, then try crypto-normalized
    let result = await db.query(
      "DELETE FROM user_watchlist WHERE clerk_user_id = $1 AND ticker_symbol = $2",
      [clerkUserId, upperSymbol]
    );

    if (result.rowCount === 0 && upperSymbol !== cryptoSymbol) {
      result = await db.query(
        "DELETE FROM user_watchlist WHERE clerk_user_id = $1 AND ticker_symbol = $2",
        [clerkUserId, cryptoSymbol]
      );
    }

    if (result.rowCount === 0) {
      await ctx.reply(`${displaySymbol} is not in your watchlist.`);
    } else {
      const redis = ctx.gatewayAPI.redis;
      await redis.del(`wishlist:${clerkUserId}`);

      await ctx.reply(
        `${displaySymbol} has been removed from your watchlist.`
      );
    }
  } catch (err) {
    logger.error({ err, symbol: upperSymbol, userId }, "Error in /remove command");
    await notifyError(ctx, err, `/remove — Command failed (${upperSymbol})`, "Something went wrong. Please try again later.");
  }
});

export default composer;
