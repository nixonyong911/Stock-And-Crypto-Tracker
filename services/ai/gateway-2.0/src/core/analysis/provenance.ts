import type { Pool } from "pg";

// ── Prompt / validator version constants ──────────────────────────────

export const NEWS_PROCESSOR_PROMPT_VERSION = "news-processor.v1";
export const MEMORY_CURATOR_PROMPT_VERSION = "memory-curator.v1";
export const NEWS_PROCESSOR_VALIDATOR_VERSION = "news-processor.zod.v1";
export const MEMORY_CURATOR_VALIDATOR_VERSION = "memory-curator.zod.v1";

// ── Ticker universe validation ────────────────────────────────────────

export interface TickerValidationResult {
  known: string[];
  unknown: string[];
}

/**
 * Checks the supplied tickers against `stock_tickers` + `crypto_tickers`.
 * Returns `{ known, unknown }` without modifying the caller's list.
 * On failure, returns all tickers as known so writes are never blocked.
 */
export async function validateTickersAgainstUniverse(
  pool: Pool,
  tickers: readonly string[],
): Promise<TickerValidationResult> {
  if (tickers.length === 0) return { known: [], unknown: [] };

  try {
    const { rows } = await pool.query<{ symbol: string }>(
      `SELECT DISTINCT symbol FROM (
         SELECT symbol FROM stock_tickers WHERE symbol = ANY($1::text[])
         UNION ALL
         SELECT symbol FROM crypto_tickers WHERE symbol = ANY($1::text[])
       ) u`,
      [tickers as string[]],
    );

    const knownSet = new Set(rows.map((r) => r.symbol));
    const known: string[] = [];
    const unknown: string[] = [];
    for (const t of tickers) {
      if (knownSet.has(t)) {
        known.push(t);
      } else {
        unknown.push(t);
      }
    }
    return { known, unknown };
  } catch {
    return { known: [...tickers], unknown: [] };
  }
}
