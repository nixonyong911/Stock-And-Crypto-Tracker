// Slice 5: deterministic broad-index boilerplate sanitization for
// analysis_market_memory affected_tickers at INSERT time.
//
// Removes tickers from the LLM-proposed affected_tickers when:
//   1. the ticker is in the BROAD_INDEX_BOILERPLATE set, AND
//   2. no contributing story (overlap with theme tickers) carries that ticker.
//
// Pure / deterministic / no I/O. Safe fallback on any internal failure.

export const BROAD_INDEX_BOILERPLATE_TICKERS: ReadonlySet<string> = new Set([
  "SPX500",
  "NSDQ100",
  "DJ30",
  "RTY",
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "VTI",
  "VOO",
]);

export interface TickerSanitizationResult {
  /** Tickers to persist in affected_tickers (uppercased, deduped, order-preserved). */
  kept: string[];
  /** Tickers dropped from affected_tickers (for tickers_inferred column). */
  inferred: string[];
}

/**
 * Whether broad-index sanitization is active. Default true.
 * Set `MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false` to disable.
 */
export function getSanitizeBroadTickersEnabled(): boolean {
  const raw = process.env["MEMORY_CURATOR_SANITIZE_BROAD_TICKERS"];
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() !== "false";
}

/**
 * Remove unevidenced broad-index boilerplate tickers from a new theme's
 * affected_tickers. A ticker is "evidenced" if it appears in the union of
 * affected_tickers from contributing stories (stories whose tickers overlap
 * with the theme's tickers, case-insensitive).
 *
 * Fallbacks:
 *   - evidencedUnion empty → return original unchanged (no drops).
 *   - sanitization would empty the array → return original unchanged.
 *   - any internal error → return original unchanged with empty inferred.
 */
export function sanitizeAffectedTickers(
  themeAffectedTickers: ReadonlyArray<string>,
  contributingStories: ReadonlyArray<{
    affected_tickers: ReadonlyArray<string>;
  }>,
): TickerSanitizationResult {
  try {
    const originalUpper = themeAffectedTickers
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toUpperCase());

    if (originalUpper.length === 0) {
      return { kept: [], inferred: [] };
    }

    const themeSet = new Set(originalUpper);

    // Build evidencedUnion: tickers from stories whose affected_tickers
    // overlap with the theme's tickers (same criterion as computeMemoryPrimary).
    const evidencedUnion = new Set<string>();
    for (const story of contributingStories) {
      const storyTickers = (story.affected_tickers ?? [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toUpperCase());
      const overlaps = storyTickers.some((t) => themeSet.has(t));
      if (overlaps) {
        for (const t of storyTickers) evidencedUnion.add(t);
      }
    }

    // Fallback: no contributing stories found → no evidence to judge against.
    if (evidencedUnion.size === 0) {
      return { kept: dedup(originalUpper), inferred: [] };
    }

    const kept: string[] = [];
    const inferred: string[] = [];

    for (const t of originalUpper) {
      if (BROAD_INDEX_BOILERPLATE_TICKERS.has(t) && !evidencedUnion.has(t)) {
        inferred.push(t);
      } else {
        kept.push(t);
      }
    }

    // Fallback: sanitization would empty the array → keep original.
    if (kept.length === 0) {
      return { kept: dedup(originalUpper), inferred: [] };
    }

    return { kept: dedup(kept), inferred: dedup(inferred) };
  } catch {
    const safe = themeAffectedTickers
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toUpperCase());
    return { kept: safe, inferred: [] };
  }
}

/** Deduplicate while preserving first-occurrence order. */
function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
