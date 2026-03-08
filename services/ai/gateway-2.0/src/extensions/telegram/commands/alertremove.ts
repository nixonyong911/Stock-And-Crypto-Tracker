import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";

const SYMBOL_REGEX = /^[A-Za-z0-9/\-.]+$/;

const USAGE_TEXT = [
  "**Usage:** `/alertremove <symbol>`",
  "",
  "**Examples:**",
  "`/alertremove NVDA` — remove all alerts for NVDA",
  "`/alertremove BTC` — remove all alerts for BTC",
].join("\n");

function normalizeCryptoSymbol(symbol: string): string {
  symbol = symbol.toUpperCase().trim();
  if (!symbol.includes("/")) {
    symbol = `${symbol}/USD`;
  }
  return symbol;
}

const composer = new Composer<TelegramBotContext>();

composer.command(["alertremove", "trackremove"], async (ctx) => {
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

  const rawArgs = (ctx.match?.toString() ?? "").trim();
  if (!rawArgs) {
    await ctx.reply(USAGE_TEXT, { parse_mode: "Markdown" });
    return;
  }

  const rawSymbol = rawArgs.split(/\s+/)[0]!;

  if (!SYMBOL_REGEX.test(rawSymbol)) {
    await ctx.reply(`Invalid symbol format.\n\n${USAGE_TEXT}`, { parse_mode: "Markdown" });
    return;
  }

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;

  const upperSymbol = rawSymbol.toUpperCase().trim();
  const cryptoSymbol = normalizeCryptoSymbol(rawSymbol);
  const displaySymbol = upperSymbol;

  try {
    let result = await db.query(
      "DELETE FROM user_price_alerts WHERE clerk_user_id = $1 AND ticker_symbol = $2 AND status = 'active'",
      [clerkUserId, upperSymbol]
    );

    if (result.rowCount === 0 && upperSymbol !== cryptoSymbol) {
      result = await db.query(
        "DELETE FROM user_price_alerts WHERE clerk_user_id = $1 AND ticker_symbol = $2 AND status = 'active'",
        [clerkUserId, cryptoSymbol]
      );
    }

    if (result.rowCount === 0) {
      await ctx.reply(`No active alerts found for ${displaySymbol}.`);
    } else {
      await ctx.reply(`Removed ${result.rowCount} alert(s) for ${displaySymbol}.`);
    }
  } catch (err) {
    logger.error({ err, symbol: upperSymbol, userId }, "Error in /alertremove command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
});

export default composer;
