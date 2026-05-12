// Slice 5 + Slice 8 + Slice 9: deterministic broad-index/macro-proxy
// boilerplate sanitization for analysis_market_memory affected_tickers.
//
// Removes tickers from affected_tickers when:
//   1. the ticker is in the active broad set (tier-dependent), AND
//   2. no contributing story (overlap with theme tickers) carries that ticker.
//
// Slice 8 additions:
//   - BROAD_MACRO_PROXY_TICKERS (GOLD, OIL, NATGAS, BTC, BTC/USD, ETH, ETH/USD)
//   - Tiered set composition via MEMORY_CURATOR_BROAD_TICKER_TIER (v1 | v2)
//   - Zero-evidence fallback replaced with all-broad / mixed-theme tiered rule
//
// Slice 9 addition:
//   - MEMORY_CURATOR_RESANITIZE_ON_UPDATE env reader (default false)
//     Gates re-application of the sanitizer on the UPDATE path.
//
// Pure / deterministic / no I/O. Safe fallback on any internal failure.

/** Slice 5 original set: US index ETFs and platform index proxies. */
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

/** Slice 8: commodity and crypto megacap proxies commonly used as boilerplate. */
export const BROAD_MACRO_PROXY_TICKERS: ReadonlySet<string> = new Set([
  "GOLD",
  "OIL",
  "NATGAS",
  "BTC",
  "BTC/USD",
  "ETH",
  "ETH/USD",
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
 * Slice 8: which tier of the broad-ticker set is active.
 *   "v1" = BROAD_INDEX_BOILERPLATE_TICKERS only (Slice 5 legacy)
 *   "v2" = union of BROAD_INDEX_BOILERPLATE_TICKERS + BROAD_MACRO_PROXY_TICKERS
 * Default "v2". Unknown values fall back to "v2".
 */
export function getBroadTickerTier(): "v1" | "v2" {
  const raw = process.env["MEMORY_CURATOR_BROAD_TICKER_TIER"];
  if (raw === "v1") return "v1";
  return "v2";
}

/**
 * Slice 9: whether the sanitizer re-runs on the UPDATE path. Default false.
 * Set `MEMORY_CURATOR_RESANITIZE_ON_UPDATE=true` to enable.
 * Strict: only the literal string "true" (case-insensitive) activates it.
 */
export function getResanitizeOnUpdateEnabled(): boolean {
  const raw = process.env["MEMORY_CURATOR_RESANITIZE_ON_UPDATE"];
  if (raw === undefined || raw === "") return false;
  return raw.toLowerCase() === "true";
}

/** Compose the active broad set based on the configured tier. */
export function getActiveBroadSet(): ReadonlySet<string> {
  if (getBroadTickerTier() === "v1") return BROAD_INDEX_BOILERPLATE_TICKERS;
  const union = new Set<string>();
  for (const t of BROAD_INDEX_BOILERPLATE_TICKERS) union.add(t);
  for (const t of BROAD_MACRO_PROXY_TICKERS) union.add(t);
  return union;
}

/**
 * Remove unevidenced broad boilerplate tickers from a new theme's
 * affected_tickers. A ticker is "evidenced" if it appears in the union of
 * affected_tickers from contributing stories (stories whose tickers overlap
 * with the theme's tickers, case-insensitive).
 *
 * Slice 8 zero-evidence fallback (replaces the Slice 5 "return unchanged"):
 *   - evidencedUnion empty AND theme is entirely broad → all move to inferred,
 *     kept = [] (the all-broad-theme path).
 *   - evidencedUnion empty AND theme has non-broad tickers → use non-broad
 *     subset as synthetic evidence; broad → inferred, non-broad → kept.
 *   - evidencedUnion non-empty → standard Slice 5 split logic.
 *   - sanitization would empty the array (non-zero-evidence path) → keep original.
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

    const broadSet = getActiveBroadSet();
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

    // Slice 8: zero-evidence tiered fallback
    if (evidencedUnion.size === 0) {
      const allBroad = originalUpper.every((t) => broadSet.has(t));
      if (allBroad) {
        return { kept: [], inferred: dedup(originalUpper) };
      }
      // Mixed theme: non-broad tickers stay in kept, broad move to inferred.
      const kept: string[] = [];
      const inferred: string[] = [];
      for (const t of originalUpper) {
        if (broadSet.has(t)) {
          inferred.push(t);
        } else {
          kept.push(t);
        }
      }
      return { kept: dedup(kept), inferred: dedup(inferred) };
    }

    const kept: string[] = [];
    const inferred: string[] = [];

    for (const t of originalUpper) {
      if (broadSet.has(t) && !evidencedUnion.has(t)) {
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
