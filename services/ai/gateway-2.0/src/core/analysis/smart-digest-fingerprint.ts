import { createHash } from "node:crypto";
import type { Pool } from "pg";

// ── Reuse-eligibility constants ───────────────────────────────────────

export const CURRENT_DIGEST_BRIEF_SCHEMA_VERSION = 1;

// Bumped to "2" when the default-branch level cascade was changed to
// anchor `holdAbove` to `max(structHold, ema20)` instead of the legacy
// `entryLow ?? periodLow ?? ema20` cascade. The bump forces the 24 h
// reuse cache to evict so users see new wording immediately rather than
// after natural expiry.
//
// Bumped to "3" for the single-side polish pass: a `breakBelow` farther
// than 25% from spot now collapses to em-dash (renderer falls back to
// the single-line "Key level to watch:" form), and a default-branch
// `holdAbove` more than 25% above spot is swapped to whichever of
// `entryLow`, `periodLow`, or `ema20` is closer to spot (when one
// exists). Cached `v2` artifacts that pre-date the polish are evicted
// so users see the new behavior immediately.
//
// Bumped to "4" for the at-a-glance card redesign: the brief now carries
// `stance5` (5-level bull/bear), `stars`, `levelsBar`, `actionGuide`,
// `companyName`, and `logoDataUri`. The bump evicts pre-redesign `v3`
// artifacts so reused payloads always include the new card fields.
// `v5`: levels-bar zones re-anchored to the stable 52-week range (buy =
// lowest 25%, sell = highest 25%) instead of the daily entry/target band.
//
// Bumped to "6" for the long-horizon regime work: the stance blend gains a
// regime pillar (price vs SMA-200, 50/200 cross) and the action guide is
// LLM-composed from deterministic facts (rule-based sentence as fallback).
// The bump evicts pre-regime `v5` artifacts so every card re-scores with
// the new pillar and picks up the richer guide.
export const CURRENT_GENERATOR_VERSION = "6";

export const CURRENT_PROMPT_VERSION: string | null = null;

// ── Audit-only provenance ─────────────────────────────────────────────

export const CURRENT_CODE_VERSION: string =
  process.env["GIT_SHA"] ??
  process.env["IMAGE_TAG"] ??
  `dev-${process.env["NODE_ENV"] ?? "local"}`;

// ── Fingerprint helpers ───────────────────────────────────────────────

function stableHash(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
  return createHash("sha256").update(json).digest("hex");
}

function stableSortedHash(items: Record<string, unknown>[]): string {
  const sorted = items
    .map((item) => JSON.stringify(item, Object.keys(item).sort()))
    .sort();
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export interface TruthFingerprintInput {
  priceTargetId: number | null;
  priceTargetUpdatedAt: string | null;
  analysisDate: string | null;
  newsOneLiner: string | null;
  macroSignature: string | null;
  /**
   * Long-trend signature: `<computed_at date>:<sma50>:<sma200>` with MAs
   * rounded to 5 significant digits — regenerates the artifact when the
   * regime inputs genuinely move, immune to float jitter. Null when no
   * fresh trend metrics row exists.
   */
  trendSignature: string | null;
}

export interface ContextFingerprintInput {
  memoryThemes: Array<{
    theme_id: string;
    last_updated: string;
    prompt_version: string | null;
  }>;
  newsHeadlines: Array<{
    batch_id: string;
    processed_at: string;
  }>;
}

export function computeTruthHash(input: TruthFingerprintInput): string {
  const projection = {
    analysisDate: input.analysisDate ?? null,
    macroSignature: input.macroSignature ?? null,
    newsOneLiner: input.newsOneLiner?.trim() || null,
    priceTargetId: input.priceTargetId ?? null,
    priceTargetUpdatedAt: input.priceTargetUpdatedAt ?? null,
    trendSignature: input.trendSignature ?? null,
  };
  return stableHash(projection);
}

export function computeContextHash(input: ContextFingerprintInput): string {
  const themes = input.memoryThemes.map((t) => ({
    last_updated: t.last_updated,
    prompt_version: t.prompt_version,
    theme_id: t.theme_id,
  }));
  const headlines = input.newsHeadlines.map((h) => ({
    batch_id: h.batch_id,
    processed_at: h.processed_at,
  }));
  return stableSortedHash([
    ...themes.map((t) => t as Record<string, unknown>),
    ...headlines.map((h) => h as Record<string, unknown>),
  ]);
}

// ── DB-backed fingerprint computation ─────────────────────────────────

function buildTrendSignature(
  row: { computed_at: string; sma_50: string | null; sma_200: string | null } | undefined,
): string | null {
  if (!row) return null;
  const fmt = (v: string | null): string => {
    const n = v != null ? parseFloat(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n.toPrecision(5) : "-";
  };
  const date = row.computed_at.slice(0, 10);
  return `${date}:${fmt(row.sma_50)}:${fmt(row.sma_200)}`;
}

export async function computeTruthFingerprint(
  db: Pool,
  symbol: string,
  assetType?: "stock" | "crypto",
): Promise<{ hash: string; input: TruthFingerprintInput }> {
  const { rows } = await db.query<{
    id: number;
    updated_at: string;
    analysis_date: string;
  }>(
    `SELECT id, updated_at::text, analysis_date::text
     FROM analysis_ticker_price_targets
     WHERE ticker_symbol = $1
     ORDER BY analysis_date DESC
     LIMIT 1`,
    [symbol],
  );
  const pt = rows[0];

  const memRes = await db.query<{
    news_one_liner: string | null;
  }>(
    `SELECT news_one_liner
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
       AND affected_tickers && ARRAY[$1]::text[]
     ORDER BY last_updated DESC
     LIMIT 1`,
    [symbol],
  );
  const newsOneLiner = memRes.rows[0]?.news_one_liner ?? null;

  // Long-trend signature (regime pillar inputs). Missing table / no fresh
  // row / unknown asset type all degrade to null — same hash as pre-regime
  // inputs-absent state.
  let trendSignature: string | null = null;
  try {
    const trendQuery =
      assetType === "crypto"
        ? `SELECT r.computed_at::text, r.sma_50::text, r.sma_200::text
           FROM analysis_crypto_range_52w r
           JOIN crypto_tickers t ON t.id = r.crypto_ticker_id
           WHERE UPPER(t.symbol) = UPPER($1)
             AND r.computed_at >= NOW() - INTERVAL '7 days'
           LIMIT 1`
        : `SELECT m.computed_at::text, m.sma_50::text, m.sma_200::text
           FROM analysis_stock_trend_metrics m
           JOIN stock_tickers t ON t.id = m.stock_ticker_id
           WHERE UPPER(t.symbol) = UPPER($1)
             AND m.computed_at >= NOW() - INTERVAL '7 days'
           LIMIT 1`;
    const trendRes = await db.query<{
      computed_at: string;
      sma_50: string | null;
      sma_200: string | null;
    }>(trendQuery, [symbol]);
    trendSignature = buildTrendSignature(trendRes.rows[0]);
  } catch {
    /* table not migrated yet — degrade to null */
  }

  const input: TruthFingerprintInput = {
    priceTargetId: pt?.id ?? null,
    priceTargetUpdatedAt: pt?.updated_at ?? null,
    analysisDate: pt?.analysis_date ?? null,
    newsOneLiner,
    macroSignature: null,
    trendSignature,
  };

  return { hash: computeTruthHash(input), input };
}

export async function computeContextFingerprint(
  db: Pool,
  symbol: string,
): Promise<{ hash: string; input: ContextFingerprintInput }> {
  const memRes = await db.query<{
    theme_id: string;
    last_updated: string;
    prompt_version: string | null;
  }>(
    `SELECT theme_id::text, last_updated::text, prompt_version
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
       AND affected_tickers && ARRAY[$1]::text[]
     ORDER BY last_updated DESC
     LIMIT 10`,
    [symbol],
  );

  const newsRes = await db.query<{
    batch_id: string;
    processed_at: string;
  }>(
    `SELECT batch_id::text, processed_at::text
     FROM analysis_filtered_news
     WHERE affected_tickers && ARRAY[$1]::text[]
     ORDER BY processed_at DESC
     LIMIT 10`,
    [symbol],
  );

  const input: ContextFingerprintInput = {
    memoryThemes: memRes.rows,
    newsHeadlines: newsRes.rows,
  };

  return { hash: computeContextHash(input), input };
}
