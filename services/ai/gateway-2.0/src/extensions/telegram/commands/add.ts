import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { Tier } from "../../../extension/types.js";
import {
  parseAddArgs,
  buildSuggestion,
  getDisplayName,
} from "./add-utils.js";
import { notifyError } from "../utils.js";

const FREE_TIER_MAX_TICKERS = 5;

const USAGE_TEXT = [
  "**Usage:** `/add <symbol> [type]`",
  "",
  "**Examples:**",
  "`/add AAPL` — add a stock (default)",
  "`/add BTC` — add a cryptocurrency (auto-detected)",
  "`/add SPY etf` — add an ETF",
  "`/add GOLD` — add a commodity (auto-detected)",
  "`/add SPX500` — add an index (auto-detected)",
  "",
  "**Supported types:** `stock`, `etf`, `crypto`, `commodity`, `index`",
  "**Aliases:** `stocks`, `coin`, `token`, `equity`, `commodities`, `indices`",
  "If omitted, the system auto-detects known cryptos, commodities, and indices.",
].join("\n");

const composer = new Composer<TelegramBotContext>();

composer.command("add", async (ctx) => {
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
      await notifyError(
        ctx,
        new Error("Session middleware failed to load session"),
        "/add — Session load failed",
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

  const rawArgs = (ctx.match?.toString() ?? "").trim();
  if (!rawArgs) {
    await ctx.reply(USAGE_TEXT, { parse_mode: "Markdown" });
    return;
  }

  const parsed = parseAddArgs(rawArgs);

  if (!parsed.ok) {
    await ctx.reply(`${parsed.error}\n\n${USAGE_TEXT}`, { parse_mode: "Markdown" });
    return;
  }

  const { symbol, assetType } = parsed;
  const displaySymbol = getDisplayName(symbol, assetType);

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;

  try {
    const existingWatch = await db.query(
      "SELECT id FROM user_watchlist WHERE clerk_user_id = $1 AND ticker_symbol = $2",
      [clerkUserId, symbol]
    );
    if (existingWatch.rows[0]) {
      await ctx.reply(`${displaySymbol} is already in your watchlist.`);
      return;
    }

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

    let isNewTicker = false;
    if (!tickerExists) {
      const dataFetcherUrl = ctx.gatewayAPI.config.dataFetcherInternalUrl;
      const assetTypeMap: Record<string, string> = {
        stock: "Stock", etf: "Etf", crypto: "Crypto",
        commodity: "Commodity", index: "Index",
      };
      const apiAssetType = assetTypeMap[assetType] ?? "Stock";

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
          const suggestion = buildSuggestion(symbol.split("/")[0] ?? symbol, assetType);
          const extra = suggestion ? `\n${suggestion}` : "";
          await ctx.reply(
            `Symbol '${displaySymbol}' not found as ${assetType}.${extra}\n\n${USAGE_TEXT}`,
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
        await notifyError(ctx, new Error(`Ticker API ${response.status}: ${JSON.stringify(body)}`), `/add — Ticker creation API error (${symbol})`, "Something went wrong. Please try again later.");
        return;
      }

      const responseMsg = String(body.message ?? "");
      isNewTicker = responseMsg !== "Ticker already exists and is active" &&
        responseMsg !== "Ticker re-enabled successfully";
    }

    await db.query(
      `INSERT INTO user_watchlist (clerk_user_id, asset_type, ticker_symbol)
       VALUES ($1, $2, $3)
       ON CONFLICT (clerk_user_id, ticker_symbol) DO NOTHING`,
      [clerkUserId, assetType, symbol]
    );

    const redis = ctx.gatewayAPI.redis;
    await redis.del(`wishlist:${clerkUserId}`);
    await redis.del(`wishlist:ticker:${symbol}`);

    if (isNewTicker) {
      await ctx.reply(
        `${displaySymbol} has been added to your watchlist. It may take 15 minutes to 1 hour for the system to research and gather data for this new ticker.`
      );
    } else {
      await ctx.reply(`${displaySymbol} has been added to your watchlist.`);
    }
  } catch (err) {
    logger.error({ err, symbol, userId }, "Error in /add command");
    await notifyError(ctx, err, `/add — Command failed (${symbol})`, "Something went wrong. Please try again later.");
  }
});

export default composer;
