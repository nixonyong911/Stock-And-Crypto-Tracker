/**
 * Smart Digest card-shape verification.
 *
 * Builds four DigestBrief fixtures using the real `generateDigestBrief`
 * helper, renders each through `card-renderer.ts`, and DMs the resulting
 * PNGs to the requested Telegram user.
 *
 * Coverage matrix:
 *   1. stock + with context     (AAPL,    Watch zone,    news one-liner)
 *   2. stock + without context  (TSLA,    Caution,       no context)
 *   3. crypto + with context    (BTC/USD, Constructive,  macro-derived context)
 *   4. crypto + without context (ETH/USD, Neutral,       no context)
 *
 * Usage (from services/ai/gateway-2.0):
 *   infisical run --env=dev -- npx tsx scripts/verify-digest-cards.ts
 *
 * Required env: TELEGRAM_BOT_TOKEN, plus DATABASE_URL (or DATABASE_URL_JS)
 *   — unless SAMPLE_CHAT_ID is set, in which case the DB lookup is skipped.
 */

import pg from "pg";
import { renderCard, buildCardCaption } from "../src/core/analysis/card-renderer.js";
import {
  generateDigestBrief,
  type DigestBrief,
} from "../src/core/analysis/digest-brief-generator.js";
import type {
  TickerSignal,
  MacroContext,
} from "../src/core/analysis/recommendation-engine.js";

const { Pool } = pg;

const DEFAULT_CLERK_USER_ID = "user_3AFKJYB2MSQhD6qwtyU9UAc9nyL";

// ── Fixture factory ──────────────────────────────────────────────────

interface Scenario {
  label: string;
  signal: TickerSignal;
  symbol: string;
  macroContext?: MacroContext;
  newsOneLinerMap?: Map<string, string>;
}

const macroSupportive: MacroContext = {
  headlines: [
    "Rate-cut odds firm up after softer payrolls",
    "ETF inflows accelerate into mega-cap tech",
  ],
  dominantTheme: "macro",
  overallSentiment: 0.35,
};

const scenarios: Scenario[] = [
  {
    label: "stock + with context (AAPL Watch zone)",
    symbol: "AAPL",
    signal: {
      symbol: "AAPL",
      assetType: "stock",
      type: "entry_zone",
      priority: "high",
      timeframeAlignment: "full",
      headline: "AAPL is near a key support level",
      rawData: {
        close: 270.95,
        latestOpen: 269.82,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        entryLow: 256.8,
        entryHigh: 262.5,
        stopLoss: 248,
        ema20: 263.4,
        periodLow: 252.1,
        confidence: 0.78,
      },
    },
    newsOneLinerMap: new Map([
      [
        "AAPL",
        "Stronger services guidance at last week's analyst day; mega-cap tech is catching a bid as rate-cut odds firm.",
      ],
    ]),
  },
  {
    label: "stock + without context (TSLA Caution)",
    symbol: "TSLA",
    signal: {
      symbol: "TSLA",
      assetType: "stock",
      type: "stop_loss_warning",
      priority: "high",
      timeframeAlignment: "partial",
      headline: "TSLA below invalidation level",
      rawData: {
        close: 218.4,
        latestOpen: 224.1,
        daySignal: "bearish",
        swingSignal: "bearish",
        longTermSignal: "neutral",
        entryLow: 230,
        entryHigh: 240,
        stopLoss: 215,
        periodLow: 219,
        confidence: 0.55,
      },
    },
  },
  {
    label: "crypto + with context (BTC/USD Constructive)",
    symbol: "BTC/USD",
    signal: {
      symbol: "BTC/USD",
      assetType: "crypto",
      type: "target_reached",
      priority: "high",
      timeframeAlignment: "full",
      headline: "BTC approaching projected resistance",
      rawData: {
        close: 74_320,
        latestOpen: 73_120,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        entryLow: 71_800,
        entryHigh: 73_500,
        targetPrice: 74_900,
        stopLoss: 70_400,
        confidence: 0.82,
      },
    },
    macroContext: macroSupportive,
  },
  {
    label: "crypto + without context (ETH/USD Neutral)",
    symbol: "ETH/USD",
    signal: {
      symbol: "ETH/USD",
      assetType: "crypto",
      type: "momentum_shift",
      priority: "medium",
      timeframeAlignment: "partial",
      headline: "ETH MACD momentum shifted",
      rawData: {
        close: 3_412.55,
        latestOpen: 3_409.0,
        daySignal: "neutral",
        swingSignal: "neutral",
        longTermSignal: "neutral",
        entryLow: 3_350,
        stopLoss: 3_280,
        macdHistogram: 0,
        previousMacdHistogram: -0.2,
      },
    },
  },
];

// ── Telegram helpers ─────────────────────────────────────────────────

async function resolveTelegramChatId(
  pool: pg.Pool,
  clerkUserId: string,
): Promise<string> {
  try {
    const r = await pool.query<{ platform_user_id: string }>(
      `SELECT platform_user_id
         FROM channel_accounts
        WHERE clerk_user_id = $1
          AND channel_type = 'telegram'
        LIMIT 1`,
      [clerkUserId],
    );
    const id = r.rows[0]?.platform_user_id;
    if (!id) {
      throw new Error(
        `No Telegram pairing found in channel_accounts for clerk user ${clerkUserId}`,
      );
    }
    return id;
  } catch (err) {
    throw new Error(
      `Failed to resolve Telegram chat id for ${clerkUserId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function maskChatId(id: string): string {
  return id.length <= 4 ? "****" : `***${id.slice(-4)}`;
}

async function sendCard(
  botToken: string,
  chatId: string,
  brief: DigestBrief,
  filename: string,
): Promise<void> {
  const pngBuffer = await renderCard(brief);
  const caption = buildCardCaption(brief);

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append(
    "photo",
    new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }),
    filename,
  );
  formData.append("caption", caption);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: formData,
  });

  const json = (await res.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };

  if (!json.ok) {
    throw new Error(
      `Telegram sendPhoto failed: ${JSON.stringify(json)}`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  const overrideChatId = process.env["SAMPLE_CHAT_ID"];
  const databaseUrl =
    process.env["DATABASE_URL"] ?? process.env["DATABASE_URL_JS"];
  const clerkUserId =
    process.env["SAMPLE_CLERK_USER_ID"] ?? DEFAULT_CLERK_USER_ID;

  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }

  let chatId: string;
  let pool: pg.Pool | null = null;

  if (overrideChatId) {
    chatId = overrideChatId;
    console.log(
      `Using SAMPLE_CHAT_ID override (${maskChatId(chatId)}); skipping DB lookup`,
    );
  } else {
    if (!databaseUrl) {
      console.error(
        "DATABASE_URL (or DATABASE_URL_JS) not set, and no SAMPLE_CHAT_ID provided",
      );
      process.exit(1);
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 5_000,
    });
    console.log(`Resolving Telegram chat id for ${clerkUserId}...`);
    chatId = await resolveTelegramChatId(pool, clerkUserId);
    console.log(`Resolved chat id ${maskChatId(chatId)}`);
  }

  try {
    for (let i = 0; i < scenarios.length; i++) {
      const sc = scenarios[i]!;
      console.log(`\n[${i + 1}/${scenarios.length}] ${sc.label}`);

      const brief = generateDigestBrief({
        signals: [sc.signal],
        symbol: sc.symbol,
        macroContext: sc.macroContext,
        newsOneLinerMap: sc.newsOneLinerMap,
        // pin updatedAt for reproducibility in side-by-side review
        now: new Date("2026-05-08T07:32:00-04:00"),
      });

      console.log(
        `  ticker=${brief.ticker} stance="${brief.status.label}" tone=${brief.status.tone} ` +
          `confidence=${brief.confidence} hasMaterialContext=${brief.hasMaterialContext}`,
      );

      const filename = `digest-${i + 1}-${brief.ticker.toLowerCase()}.png`;
      await sendCard(botToken, chatId, brief, filename);
      console.log(`  ✓ sent ${filename}`);

      // Telegram rate-limit cushion: ~30 messages/sec global is plenty,
      // but spread to keep ordering predictable in the chat.
      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(
      `\nAll ${scenarios.length} cards sent successfully to ${maskChatId(chatId)}.`,
    );
  } finally {
    if (pool) {
      await pool.end().catch((err) => {
        console.warn("Failed to close pg pool cleanly:", err);
      });
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
