import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { Tier } from "../../../extension/types.js";

const VALID_ASSET_TYPES = new Set(["stock", "etf", "crypto"]);
const SYMBOL_REGEX = /^[A-Za-z0-9/\-.]+$/;
const FREE_TIER_MAX_ALERTS = 5;

const USAGE_TEXT = [
  "**Usage:** `/alert <symbol> <price> [type]`",
  "",
  "**Examples:**",
  "`/alert NVDA 190` — alert when NVDA crosses $190",
  "`/alert AAPL 250 stock` — alert for a stock",
  "`/alert BTC 70000 crypto` — alert for a cryptocurrency",
  "",
  "Type must be one of: `stock`, `etf`, `crypto`",
  "If omitted, defaults to `stock`.",
].join("\n");

function normalizeCryptoSymbol(symbol: string): string {
  symbol = symbol.toUpperCase().trim();
  if (!symbol.includes("/")) {
    symbol = `${symbol}/USD`;
  }
  return symbol;
}

const composer = new Composer<TelegramBotContext>();

composer.command(["alert", "track"], async (ctx) => {
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

  const parts = rawArgs.split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply(`Missing price.\n\n${USAGE_TEXT}`, { parse_mode: "Markdown" });
    return;
  }

  const rawSymbol = parts[0]!;
  const rawPrice = parts[1]!;
  const rawType = parts[2]?.toLowerCase();

  if (!SYMBOL_REGEX.test(rawSymbol)) {
    await ctx.reply(`Invalid symbol format.\n\n${USAGE_TEXT}`, { parse_mode: "Markdown" });
    return;
  }

  const targetPrice = parseFloat(rawPrice);
  if (Number.isNaN(targetPrice) || targetPrice <= 0) {
    await ctx.reply(`Invalid price '${rawPrice}'. Must be a positive number.\n\n${USAGE_TEXT}`, {
      parse_mode: "Markdown",
    });
    return;
  }

  let assetType = "stock";
  if (rawType) {
    if (!VALID_ASSET_TYPES.has(rawType)) {
      await ctx.reply(
        `Invalid type '${rawType}'. Use: \`stock\`, \`etf\`, or \`crypto\`.\n\n${USAGE_TEXT}`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    assetType = rawType;
  }

  let symbol = rawSymbol.toUpperCase().trim();
  const displaySymbol = assetType === "crypto"
    ? normalizeCryptoSymbol(symbol).split("/")[0]!
    : symbol;

  if (assetType === "crypto") {
    symbol = normalizeCryptoSymbol(symbol);
  }

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;

  try {
    // Duplicate check
    const existing = await db.query(
      "SELECT id FROM user_price_alerts WHERE clerk_user_id = $1 AND ticker_symbol = $2 AND target_price = $3 AND status = 'active'",
      [clerkUserId, symbol, targetPrice]
    );
    if (existing.rows[0]) {
      await ctx.reply(`You already have an active alert for ${displaySymbol} at $${targetPrice.toFixed(2)}.`);
      return;
    }

    // Tier limit
    const tier = ctx.activeSession.tier;
    let currentCount = 0;
    if (tier === Tier.Free) {
      const countResult = await db.query(
        "SELECT count(*)::int AS cnt FROM user_price_alerts WHERE clerk_user_id = $1 AND status = 'active'",
        [clerkUserId]
      );
      currentCount = countResult.rows[0]?.cnt ?? 0;
      if (currentCount >= FREE_TIER_MAX_ALERTS) {
        await ctx.reply(
          `You've reached the maximum of ${FREE_TIER_MAX_ALERTS} active alerts on the Free plan. Remove an alert or upgrade to Pro for unlimited alerts.`
        );
        return;
      }
    } else {
      const countResult = await db.query(
        "SELECT count(*)::int AS cnt FROM user_price_alerts WHERE clerk_user_id = $1 AND status = 'active'",
        [clerkUserId]
      );
      currentCount = countResult.rows[0]?.cnt ?? 0;
    }

    // Ensure ticker exists — auto-create via data-fetcher API if needed
    let tickerExists = false;
    if (assetType === "crypto") {
      const result = await db.query("SELECT id FROM crypto_tickers WHERE symbol = $1", [symbol]);
      tickerExists = result.rows.length > 0;
    } else {
      const result = await db.query("SELECT id FROM stock_tickers WHERE symbol = $1", [symbol]);
      tickerExists = result.rows.length > 0;
    }

    if (!tickerExists) {
      const dataFetcherUrl = ctx.gatewayAPI.config.dataFetcherInternalUrl;
      const apiAssetType =
        assetType === "stock" ? "Stock" : assetType === "etf" ? "Etf" : "Crypto";

      const response = await fetch(`${dataFetcherUrl}/api/ticker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, assetType: apiAssetType }),
      });

      const body = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        const errorCode = String(body.errorCode ?? "");
        const msg = String(body.message ?? "");

        if (errorCode === "NOT_FOUND" || msg.includes("not found")) {
          await ctx.reply(
            `Symbol '${displaySymbol}' not found. Check spelling and try again.\n\n${USAGE_TEXT}`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        if (errorCode === "VALIDATION_ERROR") {
          await ctx.reply(
            `Invalid symbol '${displaySymbol}'. Check spelling and try again.\n\n${USAGE_TEXT}`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        logger.error({ status: response.status, body, symbol }, "Ticker creation API error");
        await ctx.reply("Something went wrong. Please try again later.");
        return;
      }
    }

    await db.query(
      `INSERT INTO user_price_alerts (clerk_user_id, asset_type, ticker_symbol, target_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_user_id, ticker_symbol, target_price) DO NOTHING`,
      [clerkUserId, assetType, symbol, targetPrice]
    );

    const newCount = currentCount + 1;
    const limitNote = tier === Tier.Free ? ` (${newCount}/${FREE_TIER_MAX_ALERTS} alerts used)` : "";
    await ctx.reply(`Alert set for ${displaySymbol} at $${targetPrice.toFixed(2)}${limitNote}`);
  } catch (err) {
    logger.error({ err, symbol, userId }, "Error in /alert command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
});

export default composer;
