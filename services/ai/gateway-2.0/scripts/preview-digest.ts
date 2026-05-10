/**
 * Smart Digest local preview / inspection.
 *
 * Thin CLI wrapper over `buildDigestDebugReport` (the same builder powering
 * `POST /internal/debug-digest`). Default mode prints the full
 * `DigestDebugReport` JSON envelope to stdout — easy to pipe into `jq` or
 * capture for later diffing. Optional flags reproduce the legacy file dumps
 * and the PNG render.
 *
 * No Telegram send, no `user_recommendation_log` write, no Redis mutation.
 *
 * Usage (from services/ai/gateway-2.0):
 *
 *   # default: full debug envelope to stdout
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-digest.ts --symbol AAPL --asset stock | jq
 *
 *   # also dump legacy per-stage files into tmp/
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-digest.ts --symbol BTC/USD --asset crypto --write-files
 *
 *   # also render the PNG card to tmp/digest-<sym>.png
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-digest.ts --symbol AAPL --render-png
 *
 *   # diff strict vs blended whatHappening (R1 validation aid)
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-digest.ts --symbol AAPL --strict-vs-blended
 *
 * Required env: DATABASE_URL (or DATABASE_URL_JS).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { renderCard } from "../src/core/analysis/card-renderer.js";
import {
  buildDigestDebugReport,
  type DigestDebugReport,
} from "../src/core/analysis/digest-debug.js";
import type { BriefMode } from "../src/core/analysis/digest-brief-truth.js";

const { Pool } = pg;

interface CliArgs {
  symbol: string;
  asset: "stock" | "crypto";
  mode: BriefMode;
  writeFiles: boolean;
  renderPng: boolean;
  /**
   * When true, run the report builder twice (strict + blended) and emit
   * a side-by-side diff of the resulting `whatHappening` text plus the
   * `truthFlags` from `BriefTruth`. Used during R1 validation.
   */
  strictVsBlended: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let symbol = "";
  let asset: "stock" | "crypto" = "stock";
  let mode: BriefMode = "strict";
  let writeFiles = false;
  let renderPng = false;
  let strictVsBlended = false;

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
    } else if (a === "--write-files") {
      writeFiles = true;
    } else if (a === "--render-png") {
      renderPng = true;
    } else if (a === "--strict-vs-blended") {
      strictVsBlended = true;
    }
  }

  if (!symbol) {
    throw new Error(
      "Missing required argument: --symbol <TICKER>\n" +
        "Usage: tsx scripts/preview-digest.ts --symbol AAPL [--asset stock|crypto] [--mode strict|blended] [--write-files] [--render-png] [--strict-vs-blended]",
    );
  }
  return { symbol, asset, mode, writeFiles, renderPng, strictVsBlended };
}

function fileSafe(symbol: string): string {
  return symbol.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

async function writeLegacyFiles(
  outDir: string,
  safe: string,
  report: DigestDebugReport,
): Promise<void> {
  const reportPath = join(outDir, `digest-${safe}.report.json`);
  const truthPath = join(outDir, `digest-${safe}.truth.json`);
  const derivedPath = join(outDir, `digest-${safe}.derived.json`);
  const briefPath = join(outDir, `digest-${safe}.brief.json`);

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    truthPath,
    `${JSON.stringify(report.truth, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    derivedPath,
    `${JSON.stringify(report.derived, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    briefPath,
    `${JSON.stringify(report.brief, null, 2)}\n`,
    "utf8",
  );

  console.error(`  wrote ${reportPath}`);
  console.error(`  wrote ${truthPath}`);
  console.error(`  wrote ${derivedPath}`);
  console.error(`  wrote ${briefPath}`);
}

function blendedOnlySuffix(strict: string, blended: string): string {
  if (blended.length <= strict.length) return "(none)";
  if (!blended.startsWith(strict)) return "(divergent — not a suffix)";
  const tail = blended.slice(strict.length).trim();
  return tail.length > 0 ? tail : "(whitespace only)";
}

async function main(): Promise<void> {
  const { symbol, asset, mode, writeFiles, renderPng, strictVsBlended } =
    parseArgs(process.argv.slice(2));
  void strictVsBlended;

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

  // Minimal Fastify-compatible logger surface — buildDigestDebugReport only
  // calls log.warn / log.error. We send progress to stderr so stdout stays
  // clean for the JSON envelope.
  const log = {
    info: (...args: unknown[]) => console.error("[info]", ...args),
    warn: (...args: unknown[]) => console.error("[warn]", ...args),
    error: (...args: unknown[]) => console.error("[error]", ...args),
    debug: () => {},
    trace: () => {},
    fatal: (...args: unknown[]) => console.error("[fatal]", ...args),
    child: () => log,
    level: "info",
  } as unknown as Parameters<typeof buildDigestDebugReport>[0]["log"];

  try {
    const args = parseArgs(process.argv.slice(2));
    const strictVsBlendedFlag = args.strictVsBlended;
    console.error(
      `[preview-digest] symbol=${symbol} asset=${asset} mode=${mode} ${writeFiles ? "write-files=true " : ""}${renderPng ? "render-png=true" : ""} ${strictVsBlendedFlag ? "strict-vs-blended=true" : ""}`.trim(),
    );

    const report = await buildDigestDebugReport(
      { db: pool, log },
      { symbol, assetType: asset, mode },
    );

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    // Surface truthFlags front and centre so reviewers don't have to grep
    // the JSON envelope. These come straight from `gatherTruth` when the
    // sanity guards (A4) reject a DB-supplied number. `report.truth` can
    // be null when no signals were detected for the symbol (the empty
    // path skips the truth layer entirely).
    if (report.truth == null) {
      console.error("[truthFlags] (no truth — no signals detected)");
    } else {
      const flags = report.truth.truthFlags ?? [];
      if (flags.length > 0) {
        console.error(`[truthFlags] ${flags.join(", ")}`);
      } else {
        console.error("[truthFlags] (none)");
      }
    }

    if (strictVsBlendedFlag) {
      const otherMode: BriefMode = mode === "strict" ? "blended" : "strict";
      try {
        const other = await buildDigestDebugReport(
          { db: pool, log },
          { symbol, assetType: asset, mode: otherMode },
        );
        const left = mode === "strict" ? report : other;
        const right = mode === "strict" ? other : report;
        console.error("\n[strict-vs-blended diff]");
        console.error(`  strict.whatHappening   : ${left.brief.whatHappening}`);
        console.error(`  blended.whatHappening  : ${right.brief.whatHappening}`);
        console.error(
          `  delta-chars            : ${right.brief.whatHappening.length - left.brief.whatHappening.length}`,
        );
        console.error(
          `  blended-only suffix    : ${blendedOnlySuffix(left.brief.whatHappening, right.brief.whatHappening)}`,
        );
      } catch (err) {
        console.error(
          "[preview-digest] strict-vs-blended second-pass failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (writeFiles || renderPng) {
      const outDir = join(process.cwd(), "tmp");
      await mkdir(outDir, { recursive: true });
      const safe = fileSafe(symbol);

      if (writeFiles) {
        try {
          await writeLegacyFiles(outDir, safe, report);
        } catch (err) {
          console.error(
            "[preview-digest] failed to write debug files:",
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (renderPng) {
        try {
          const png = await renderCard(report.brief);
          const pngPath = join(outDir, `digest-${safe}.png`);
          await writeFile(pngPath, png);
          console.error(
            `  wrote ${pngPath} (${png.length.toLocaleString()} bytes)`,
          );
        } catch (err) {
          console.error(
            "[preview-digest] card render failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    console.error(
      `[preview-digest] summary: ticker=${report.brief.ticker} stance="${report.brief.status.label}" confidence=${report.brief.confidence} hasMaterialContext=${report.brief.hasMaterialContext} primary=${report.primary?.type ?? "(none)"} memoryCandidates=${report.memory.candidates.length}`,
    );
  } finally {
    await pool.end().catch((err) => {
      console.error("Failed to close pg pool cleanly:", err);
    });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
