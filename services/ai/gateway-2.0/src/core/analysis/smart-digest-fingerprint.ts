import { createHash } from "node:crypto";
import type { Pool } from "pg";

// ── Reuse-eligibility constants ───────────────────────────────────────

export const CURRENT_DIGEST_BRIEF_SCHEMA_VERSION = 1;

export const CURRENT_GENERATOR_VERSION = "1";

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

export async function computeTruthFingerprint(
  db: Pool,
  symbol: string,
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

  const input: TruthFingerprintInput = {
    priceTargetId: pt?.id ?? null,
    priceTargetUpdatedAt: pt?.updated_at ?? null,
    analysisDate: pt?.analysis_date ?? null,
    newsOneLiner,
    macroSignature: null,
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
