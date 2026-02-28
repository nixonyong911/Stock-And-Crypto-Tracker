import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { Tier } from "../../../extension/types.js";
import {
  calculateWishlist,
  secondsUntilMidnightUTC,
  type WishlistTickerData,
} from "../../../core/analysis/wishlist-calculator.js";

const FREE_TIER_MAX_TICKERS = 5;
const REDIS_KEY_PREFIX = "wishlist:";

function formatPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatRange(low: number, high: number): string {
  return `${formatPrice(low)} - ${formatPrice(high)}`;
}

function formatTicker(t: WishlistTickerData): string {
  if (t.dataPoints === 0) {
    return `**${t.symbol}** | Pending...`;
  }

  if (t.dataPoints < 5) {
    return `**${t.symbol}** | ${t.latestClose != null ? formatPrice(t.latestClose) : "N/A"}\n  Building data... (${t.dataPoints} day${t.dataPoints === 1 ? "" : "s"})`;
  }

  const lines: string[] = [];
  const badge = t.isEntryZone ? " **⚡ ENTRY ZONE**" : "";
  lines.push(`**${t.symbol}** | ${t.latestClose != null ? formatPrice(t.latestClose) : "N/A"}${badge}`);

  if (t.entryRange) {
    lines.push(`  Entry: ${formatRange(t.entryRange.low, t.entryRange.high)} (today: ${formatPrice(t.entryRange.today)})`);
  }

  const parts: string[] = [];
  if (t.targetRange) parts.push(`Target: ${formatRange(t.targetRange.low, t.targetRange.high)}`);
  if (t.stopLossRange) parts.push(`SL: ${formatRange(t.stopLossRange.low, t.stopLossRange.high)}`);
  if (parts.length > 0) lines.push(`  ${parts.join(" | ")}`);

  const signalLabel = t.signal.charAt(0).toUpperCase() + t.signal.slice(1);
  lines.push(`  Signal: ${signalLabel}`);

  return lines.join("\n");
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
    await ctx.reply("Please login first with /login.", { parse_mode: "Markdown" });
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
    const cacheKey = `${REDIS_KEY_PREFIX}${clerkUserId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      await ctx.reply(cached, { parse_mode: "Markdown" });
      return;
    }

    const result = await calculateWishlist(db, clerkUserId);

    if (result.tickers.length === 0 && result.totalWatchlistCount === 0) {
      await ctx.reply(
        "Your watchlist is empty.\n\nUse /add <symbol> to start tracking tickers.\nExample: `/add AAPL` or `/add BTC crypto`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (result.tickers.length === 0 && result.totalWatchlistCount > 0) {
      await ctx.reply(
        "You have crypto tickers in your watchlist but stock/ETF analysis is not available for them yet.\n\nUse /add <symbol> to add stock or ETF tickers.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const lines: string[] = [];

    if (tier === Tier.Free) {
      lines.push(`**Your Watchlist** (${result.totalWatchlistCount}/${FREE_TIER_MAX_TICKERS} used - Free tier)\n`);
    } else {
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      lines.push(`**Your Watchlist** (${result.tickers.length} tickers - ${tierLabel})\n`);
    }

    for (const t of result.tickers) {
      lines.push(formatTicker(t));
      lines.push("");
    }

    if (result.asOfDate) {
      lines.push(`_Data as of: ${result.asOfDate}_`);
    }

    if (tier === Tier.Free) {
      lines.push("_Upgrade to Pro for unlimited tracking._");
    }

    const message = lines.join("\n");

    const ttl = secondsUntilMidnightUTC();
    if (ttl > 0) {
      await redis.set(cacheKey, message, "EX", ttl);
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (err) {
    logger.error({ err, userId }, "Error in /wishlist command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
}

composer.command("wishlist", handleWishlist);
composer.command("watchlist", handleWishlist);

export default composer;
