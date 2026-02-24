import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { Tier } from "../../../extension/types.js";

const VALID_ASSET_TYPES = new Set(["stock", "etf", "crypto"]);
const SYMBOL_REGEX = /^[A-Za-z0-9/\-.]+$/;
const FREE_TIER_MAX_TICKERS = 5;

const USAGE_TEXT = [
  "**Usage:** `/add <symbol> [type]`",
  "",
  "**Examples:**",
  "`/add AAPL` — add a stock (default)",
  "`/add AAPL stock` — add a stock",
  "`/add SPY etf` — add an ETF",
  "`/add BTC crypto` — add a cryptocurrency",
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

composer.command("add", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  // Auth guard: require paired + logged-in session
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
    await ctx.reply("Please login first with /login.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const clerkUserId = ctx.activeSession.clerkUserId;
  if (!clerkUserId) {
    await ctx.reply("Account not linked. Please re-pair your account.", {
      parse_mode: "Markdown",
    });
    return;
  }

  // Parse arguments: /add <symbol> [type]
  const rawArgs = (ctx.match?.toString() ?? "").trim();
  if (!rawArgs) {
    await ctx.reply(USAGE_TEXT, { parse_mode: "Markdown" });
    return;
  }

  const parts = rawArgs.split(/\s+/);
  const rawSymbol = parts[0]!;
  const rawType = parts[1]?.toLowerCase();

  if (!SYMBOL_REGEX.test(rawSymbol)) {
    await ctx.reply(
      `Invalid symbol format.\n\n${USAGE_TEXT}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Determine asset type
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

  // Normalize symbol
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
    // Check if already in user's watchlist
    const existingWatch = await db.query(
      "SELECT id FROM user_watchlist WHERE clerk_user_id = $1 AND ticker_symbol = $2",
      [clerkUserId, symbol]
    );
    if (existingWatch.rows[0]) {
      await ctx.reply(`${displaySymbol} is already in your watchlist.`);
      return;
    }

    // Tier limit check (free tier = 5 max)
    const tier = ctx.activeSession.tier;
    if (tier === Tier.Free) {
      const countResult = await db.query(
        "SELECT count(*)::int AS cnt FROM user_watchlist WHERE clerk_user_id = $1",
        [clerkUserId]
      );
      const currentCount = countResult.rows[0]?.cnt ?? 0;
      if (currentCount >= FREE_TIER_MAX_TICKERS) {
        await ctx.reply(
          `You've reached the maximum of ${FREE_TIER_MAX_TICKERS} tracked tickers on the Free plan. Upgrade to Pro for unlimited tracking.`
        );
        return;
      }
    }

    // Check if ticker already exists in the database
    let tickerExists = false;
    if (assetType === "crypto") {
      const result = await db.query(
        "SELECT id FROM crypto_tickers WHERE symbol = $1",
        [symbol]
      );
      tickerExists = result.rows.length > 0;
    } else {
      const result = await db.query(
        "SELECT id FROM stock_tickers WHERE symbol = $1",
        [symbol]
      );
      tickerExists = result.rows.length > 0;
    }

    // If ticker is new, create it via the TwelveData worker API
    let isNewTicker = false;
    if (!tickerExists) {
      const twelveDataUrl =
        ctx.gatewayAPI.config.twelveDataInternalUrl ?? "http://twelvedata:8080";
      const apiAssetType =
        assetType === "stock"
          ? "Stock"
          : assetType === "etf"
            ? "Etf"
            : "Crypto";

      const response = await fetch(`${twelveDataUrl}/api/ticker`, {
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

        logger.error(
          { status: response.status, body, symbol },
          "Ticker creation API error"
        );
        await ctx.reply("Something went wrong. Please try again later.");
        return;
      }

      const responseMsg = String(body.message ?? "");
      isNewTicker = responseMsg !== "Ticker already exists and is active" &&
        responseMsg !== "Ticker re-enabled successfully";
    }

    // Bind user to ticker
    await db.query(
      `INSERT INTO user_watchlist (clerk_user_id, asset_type, ticker_symbol)
       VALUES ($1, $2, $3)
       ON CONFLICT (clerk_user_id, ticker_symbol) DO NOTHING`,
      [clerkUserId, assetType, symbol]
    );

    if (isNewTicker) {
      await ctx.reply(
        `${displaySymbol} has been added to your watchlist. It may take 15 minutes to 1 hour for the system to research and gather data for this new ticker.`
      );
    } else {
      await ctx.reply(`${displaySymbol} has been added to your watchlist.`);
    }
  } catch (err) {
    logger.error({ err, symbol, userId }, "Error in /add command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
});

export default composer;
