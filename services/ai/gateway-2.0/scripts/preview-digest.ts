/**
 * Smart Digest local preview.
 *
 * Builds a `DigestBrief` for one symbol against the live DB, renders the
 * card, and writes the result to `tmp/`:
 *
 *   tmp/digest-<symbol>.png           PNG card
 *   tmp/digest-<symbol>.truth.json    BriefTruth JSON (DB-grounded inputs)
 *   tmp/digest-<symbol>.derived.json  BriefDerived JSON (code-derived signals)
 *   tmp/digest-<symbol>.brief.json    DigestBrief JSON (renderer input)
 *
 * No Telegram send, no `user_recommendation_log` write — this is the
 * cheapest verification path. Useful for cross-checking each truth field
 * against pgAdmin output before deploying.
 *
 * Usage (from services/ai/gateway-2.0):
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-digest.ts --symbol AAPL --asset stock
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-digest.ts --symbol BTC/USD --asset crypto
 *
 * Required env: DATABASE_URL (or DATABASE_URL_JS).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { renderCard } from "../src/core/analysis/card-renderer.js";
import {
  detectSignalsForTicker,
} from "../src/core/analysis/recommendation-engine.js";
import {
  generateDigestBrief,
} from "../src/core/analysis/digest-brief-generator.js";
import {
  gatherTruth,
  deriveSignals,
  type BriefMode,
} from "../src/core/analysis/digest-brief-truth.js";

const { Pool } = pg;

interface CliArgs {
  symbol: string;
  asset: "stock" | "crypto";
  mode: BriefMode;
}

function parseArgs(argv: string[]): CliArgs {
  let symbol = "";
  let asset: "stock" | "crypto" = "stock";
  let mode: BriefMode = "strict";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--symbol" && argv[i + 1]) {
      symbol = argv[i + 1]!.toUpperCase();
      i++;
    } else if (a === "--asset" && argv[i + 1]) {
      const next = argv[i + 1]!.toLowerCase();
      asset = next === "crypto" ? "crypto" : "stock";
      i++;
    } else if (a === "--mode" && argv[i + 1]) {
      const next = argv[i + 1]!.toLowerCase();
      mode = next === "blended" ? "blended" : "strict";
      i++;
    }
  }

  if (!symbol) {
    throw new Error(
      "Missing required argument: --symbol <TICKER>\n" +
        "Usage: tsx scripts/preview-digest.ts --symbol AAPL [--asset stock|crypto] [--mode strict|blended]",
    );
  }
  return { symbol, asset, mode };
}

function fileSafe(symbol: string): string {
  return symbol.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

async function main(): Promise<void> {
  const { symbol, asset, mode } = parseArgs(process.argv.slice(2));

  const databaseUrl =
    process.env["DATABASE_URL"] ?? process.env["DATABASE_URL_JS"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL (or DATABASE_URL_JS) must be set");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
  });

  try {
    console.log(
      `Fetching signals for ${symbol} (${asset}, mode=${mode})...`,
    );
    const result = await detectSignalsForTicker(pool, symbol, asset);
    const {
      signals,
      macroContext,
      newsOneLinerMap,
      memoryTextMap,
      analysisDateMap,
    } = result;

    if (signals.length === 0) {
      console.log(
        `No signals returned for ${symbol}. ` +
          "The pipeline would respond with `generated: false, reason: \"no_signals_for_symbol\"`. " +
          "Confirm `analysis_ticker_price_targets` has fresh rows for this ticker.",
      );
      return;
    }

    const primary = signals[0]!;
    const memoryText =
      primary.type === "news_sentiment"
        ? undefined
        : memoryTextMap.get(symbol.toUpperCase());
    const analysisDate = analysisDateMap.get(symbol.toUpperCase());

    const truth = gatherTruth({
      signal: primary,
      macroContext,
      memoryText,
      analysisDate,
    });
    const derived = deriveSignals(truth);
    const brief = generateDigestBrief({
      signals,
      symbol,
      macroContext,
      newsOneLinerMap,
      memoryTextMap,
      analysisDateMap,
      mode,
    });

    const outDir = join(process.cwd(), "tmp");
    await mkdir(outDir, { recursive: true });

    const safe = fileSafe(symbol);
    const truthPath = join(outDir, `digest-${safe}.truth.json`);
    const derivedPath = join(outDir, `digest-${safe}.derived.json`);
    const briefPath = join(outDir, `digest-${safe}.brief.json`);
    const pngPath = join(outDir, `digest-${safe}.png`);

    await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
    await writeFile(
      derivedPath,
      `${JSON.stringify(derived, null, 2)}\n`,
      "utf8",
    );
    await writeFile(briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");

    try {
      const png = await renderCard(brief);
      await writeFile(pngPath, png);
      console.log(`  wrote ${pngPath} (${png.length.toLocaleString()} bytes)`);
    } catch (err) {
      console.warn(
        `  card render failed (continuing): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    console.log(`  wrote ${truthPath}`);
    console.log(`  wrote ${derivedPath}`);
    console.log(`  wrote ${briefPath}`);
    console.log(
      `\nSummary: ticker=${brief.ticker} stance="${brief.status.label}" ` +
        `confidence=${brief.confidence} hasMaterialContext=${brief.hasMaterialContext} ` +
        `analysisDate=${truth.dataAsOf ?? "(missing)"}`,
    );
  } finally {
    await pool.end().catch((err) => {
      console.warn("Failed to close pg pool cleanly:", err);
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
