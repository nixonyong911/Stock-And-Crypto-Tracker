import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { Tier } from "../../../extension/types.js";
import {
  getWatchlist,
  calculateTickersData,
  secondsUntilMidnightUTC,
  type WishlistTickerData,
  type WatchlistRow,
} from "../../../core/analysis/wishlist-calculator.js";
import { formatDateWithDayAndTz, tzAbbreviation } from "../../../core/analysis/market-calendar.js";

const FREE_TIER_MAX_TICKERS = 5;
const TICKER_CACHE_PREFIX = "wishlist:ticker:";
const PENDING_CACHE_TTL = 300; // 5 min for tickers with no data yet
const BUILDING_CACHE_TTL = 3600; // 1 hour for tickers still building data (<5 days)

function formatPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatRange(low: number, high: number): string {
  return `${formatPrice(low)} - ${formatPrice(high)}`;
}

function displaySymbol(t: WishlistTickerData): string {
  if (t.assetType === "crypto") return t.symbol.split("/")[0]!;
  return t.symbol;
}

function formatSignalPart(
  label: string,
  signal: string | undefined,
  pct: number | null
): string {
  const s = signal ?? "neutral";
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  if (pct == null) return `${label}: ${cap}`;
  const sign = pct >= 0 ? "+" : "";
  return `${label}: ${cap} ${sign}${pct.toFixed(2)}%`;
}

function formatTicker(t: WishlistTickerData, tzLabel = "ET"): string {
  const sym = displaySymbol(t);

  if (t.dataPoints === 0) {
    return `**${sym}** | Pending...`;
  }

  if (t.dataPoints < 5) {
    return `**${sym}** | ${t.latestClose != null ? formatPrice(t.latestClose) : "N/A"}\n  Building data... (${t.dataPoints} day${t.dataPoints === 1 ? "" : "s"})`;
  }

  const lines: string[] = [];
  const badge = t.isEntryZone ? " **Near support**" : "";
  lines.push(`**${sym}**${badge}`);

  const openStr = t.latestOpen != null ? formatPrice(t.latestOpen) : "N/A";
  const closeStr = t.latestClose != null ? formatPrice(t.latestClose) : "N/A";
  lines.push(`  Open: ${openStr} | Close: ${closeStr}`);

  if (t.entryRange) {
    lines.push(`  Support: ${formatRange(t.entryRange.low, t.entryRange.high)}`);
  }

  const parts: string[] = [];
  if (t.targetRange) parts.push(`Resistance: ${formatRange(t.targetRange.low, t.targetRange.high)}`);
  if (t.stopLossRange) parts.push(`Invalidation: ${formatRange(t.stopLossRange.low, t.stopLossRange.high)}`);
  if (parts.length > 0) lines.push(`  ${parts.join(" | ")}`);

  const weekPart = formatSignalPart("Week", t.weekSignal, t.weekChangePct);
  const monthPart = formatSignalPart("Month", t.monthSignal, t.monthChangePct);
  lines.push(`  ${weekPart} | ${monthPart}`);

  if (t.analysisDate) {
    lines.push(`  Updated: ${formatDateWithDayAndTz(t.analysisDate, tzLabel)}`);
  }

  return lines.join("\n");
}

function cacheTtlForTicker(t: WishlistTickerData): number {
  if (t.dataPoints === 0) return PENDING_CACHE_TTL;
  if (t.dataPoints < 5) return BUILDING_CACHE_TTL;
  return secondsUntilMidnightUTC();
}

const composer = new Composer<TelegramBotContext>();

async function handleWishlist(ctx: TelegramBotContext) {
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
    await ctx.reply("Account not linked. Please re-pair your account.", { parse_mode: "Markdown" });
    return;
  }

  const db = ctx.gatewayAPI.db;
  const redis = ctx.gatewayAPI.redis;
  const logger = ctx.gatewayAPI.logger;
  const tier = ctx.activeSession.tier;

  try {
    // Resolve user timezone for display
    let userTzLabel = "ET";
    try {
      const tzResult = await db.query<{ timezone: string }>(
        "SELECT timezone FROM users WHERE clerk_user_id = $1",
        [clerkUserId],
      );
      const userTz = tzResult.rows[0]?.timezone;
      if (userTz && userTz !== "UTC") {
        userTzLabel = tzAbbreviation(userTz);
      }
    } catch { /* fall back to ET */ }

    const allRows = await getWatchlist(db, clerkUserId);

    if (allRows.length === 0) {
      await ctx.reply(
        "Your watchlist is empty.\n\nUse /add <symbol> to start tracking tickers.\nExample: `/add AAPL` or `/add BTC crypto`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const cachedTickers: WishlistTickerData[] = [];
    const uncachedRows: WatchlistRow[] = [];

    for (const row of allRows) {
      const cacheKey = `${TICKER_CACHE_PREFIX}${row.ticker_symbol}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as WishlistTickerData;
          if (parsed.weekSignal !== undefined) {
            cachedTickers.push(parsed);
          } else {
            await redis.del(cacheKey);
            uncachedRows.push(row);
          }
        } catch {
          uncachedRows.push(row);
        }
      } else {
        uncachedRows.push(row);
      }
    }

    let freshTickers = new Map<string, WishlistTickerData>();
    if (uncachedRows.length > 0) {
      freshTickers = await calculateTickersData(db, uncachedRows);

      for (const [symbol, data] of freshTickers) {
        const ttl = cacheTtlForTicker(data);
        if (ttl > 0) {
          const cacheKey = `${TICKER_CACHE_PREFIX}${symbol}`;
          await redis.set(cacheKey, JSON.stringify(data), "EX", ttl);
        }
      }
    }

    const tickerLookup = new Map<string, WishlistTickerData>();
    for (const t of cachedTickers) tickerLookup.set(t.symbol, t);
    for (const [sym, t] of freshTickers) tickerLookup.set(sym, t);

    const tickers: WishlistTickerData[] = [];
    let latestDate: string | null = null;
    for (const row of allRows) {
      const data = tickerLookup.get(row.ticker_symbol);
      if (!data) continue;
      tickers.push(data);
      if (data.analysisDate && (!latestDate || data.analysisDate > latestDate)) {
        latestDate = data.analysisDate;
      }
    }

    const lines: string[] = [];

    if (tier === Tier.Free) {
      lines.push(`**Your Watchlist** (${allRows.length}/${FREE_TIER_MAX_TICKERS} used - Free tier)`);
    } else {
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      lines.push(`**Your Watchlist** (${tickers.length} tickers - ${tierLabel})`);
    }
    lines.push(`_Week: Bullish >+1% | Bearish <-1%_`);
    lines.push(`_Month: Bullish >+3% | Bearish <-3%_\n`);

    for (const t of tickers) {
      lines.push(formatTicker(t, userTzLabel));
      lines.push("");
    }

    if (latestDate) {
      lines.push(`_Data as of: ${formatDateWithDayAndTz(latestDate, userTzLabel)}_`);
    }

    lines.push("Manage: `/add <symbol>` · `/remove <symbol>` · `/alert on`");

    if (tier === Tier.Free) {
      lines.push("_Upgrade to Pro for unlimited tracking._");
    }

    const message = lines.join("\n");
    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    logger.error({ err, userId }, "Error in /wishlist command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
}

composer.command("wishlist", handleWishlist);
composer.command("watchlist", handleWishlist);

export default composer;
