/**
 * Smart Digest — Step 3 Affinity Validation
 *
 * Read-only validation harness. Reads `analysis_market_memory` JSON dumped
 * from prod via SSH into stdin (or a file specified as the second arg),
 * scores every fresh row against a hard-coded list of validation symbols
 * using the same `computeSymbolAffinity` the engine uses, and emits one
 * `tmp/validation/<date>/<symbol>.json` artefact per symbol.
 *
 * Usage (from repo root):
 *
 *   ssh ... 'docker exec postgres psql ... -c "COPY (SELECT ...) TO STDOUT"' \
 *     | npx tsx scripts/verify/validate-affinity.ts
 *
 * The script does not connect to any DB itself — it just consumes the JSON
 * the SSH pipeline produced. That keeps validation reproducible and avoids
 * pulling pg into a script dir.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  computeSymbolAffinity,
  getAffinityMin,
} from "../../services/ai/gateway-2.0/src/core/analysis/digest-symbol-affinity.js";
import { newsLookupCandidateSymbols } from "../../services/ai/gateway-2.0/src/core/analysis/recommendation-engine.js";

interface RawRow {
  theme: string | null;
  category: string | null;
  affected_tickers: string[] | null;
  news_one_liner: string | null;
  summary: string | null;
  impact_level: string | null;
  relevance_score: string | null;
  sentiment_score: string | null;
  last_updated: string | null;
  status: string | null;
}

const VALIDATION_SYMBOLS = [
  "BTC/USD",
  "ETH/USD",
  "NEAR/USD",
  "SOL/USD",
  "AAPL",
  "GOLD",
  "SPX500",
];

const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function impactRank(s: string | null): number {
  return IMPACT_RANK[(s ?? "").toLowerCase()] ?? 9;
}

function tsMs(s: string | null): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  const rows: RawRow[] = raw
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RawRow);

  if (rows.length === 0) {
    console.error("no input rows; aborting");
    process.exit(2);
  }

  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve("tmp", "validation", date);
  mkdirSync(outDir, { recursive: true });

  const threshold = getAffinityMin();
  const summary: Array<{
    symbol: string;
    candidates: number;
    passed: number;
    chosenTheme: string | null;
    chosenAffinity: number | null;
    chosenReasons: string[] | null;
  }> = [];

  for (const symbol of VALIDATION_SYMBOLS) {
    const symbolUpper = symbol.toUpperCase();
    const aliases = newsLookupCandidateSymbols(symbolUpper).map((a) =>
      a.toUpperCase(),
    );
    const aliasSet = new Set(aliases);

    type Scored = {
      row: RawRow;
      affinity: ReturnType<typeof computeSymbolAffinity>;
      impact: number;
      lastUpdatedMs: number;
    };
    const scored: Scored[] = [];
    for (const r of rows) {
      const tickers = (r.affected_tickers ?? []).map((t) =>
        (t ?? "").toUpperCase(),
      );
      const intersects = tickers.some((t) => aliasSet.has(t));
      if (!intersects) continue;
      const affinity = computeSymbolAffinity({
        theme: r.theme,
        newsOneLiner: r.news_one_liner,
        affectedTickers: tickers,
        symbolUpper,
        aliases,
        threshold,
      });
      scored.push({
        row: r,
        affinity,
        impact: impactRank(r.impact_level),
        lastUpdatedMs: tsMs(r.last_updated),
      });
    }

    scored.sort((a, b) => {
      if (a.impact !== b.impact) return a.impact - b.impact;
      if (a.affinity.score !== b.affinity.score) {
        return b.affinity.score - a.affinity.score;
      }
      if (a.lastUpdatedMs !== b.lastUpdatedMs) {
        return b.lastUpdatedMs - a.lastUpdatedMs;
      }
      const ra = Number.parseFloat(a.row.relevance_score ?? "0") || 0;
      const rb = Number.parseFloat(b.row.relevance_score ?? "0") || 0;
      return rb - ra;
    });

    const chosen = scored.find((c) => c.affinity.passed) ?? null;
    const passedCount = scored.filter((c) => c.affinity.passed).length;

    const candidates = scored.map((s) => ({
      theme: s.row.theme,
      affected_tickers: s.row.affected_tickers,
      impact_level: s.row.impact_level,
      relevance_score: s.row.relevance_score,
      last_updated: s.row.last_updated,
      news_one_liner: s.row.news_one_liner,
      affinity: {
        score: s.affinity.score,
        threshold: s.affinity.threshold,
        reasons: s.affinity.reasons,
        passed: s.affinity.passed,
      },
      chosen: s === chosen,
    }));

    const artefact = {
      symbol,
      symbolUpper,
      aliases,
      threshold,
      candidatesCount: scored.length,
      passedCount,
      chosen: chosen
        ? {
            theme: chosen.row.theme,
            news_one_liner: chosen.row.news_one_liner,
            affected_tickers: chosen.row.affected_tickers,
            affinity: chosen.affinity,
          }
        : null,
      candidates,
    };

    writeFileSync(
      path.join(outDir, `${symbol.replace("/", "_")}.json`),
      JSON.stringify(artefact, null, 2),
    );

    summary.push({
      symbol,
      candidates: scored.length,
      passed: passedCount,
      chosenTheme: chosen?.row.theme ?? null,
      chosenAffinity: chosen?.affinity.score ?? null,
      chosenReasons: chosen?.affinity.reasons ?? null,
    });
  }

  console.log(JSON.stringify({ outDir, threshold, summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
