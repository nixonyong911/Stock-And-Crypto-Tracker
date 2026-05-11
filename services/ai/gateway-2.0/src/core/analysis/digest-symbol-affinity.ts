/**
 * Smart Digest — Symbol Affinity (Step 3).
 *
 * Per-row, per-symbol scorer that decides whether an `analysis_market_memory`
 * row is *actually about* the digest symbol, or merely lists it among
 * `affected_tickers` because it was co-mentioned. Pure / deterministic / no
 * I/O. Consumed by `recommendation-engine.ts` at the fetch boundary so that
 * downstream brief composition only ever sees on-symbol memory.
 *
 * Pass-1 scope (intentionally small — see plan §3.1):
 *
 *   - Text fields scored: `theme` and `news_one_liner` only. `summary` is
 *     deliberately NOT scored: it only matters in blended mode, which stays
 *     OFF in step 3.
 *   - Tokens used: ticker symbol + crypto-pair base + index ETF alias. No
 *     human-name tokens (`Apple`, `Bitcoin`, …) — that decision is deferred
 *     until validation evidence justifies the maintenance/I-O cost.
 *
 * The bonus weights and the threshold are gathered into a single constants
 * block at the top of the file. They are an initial heuristic: they were
 * chosen so the verified contamination cases in the plan fail at
 * threshold 2 and the verified-good cases pass at threshold 2. Future
 * tuning is a one-file change with no design rewrite.
 */

// ── Constants (tunable) ───────────────────────────────────────────────

/**
 * +2 when any token (ticker, crypto base, index alias) appears as a whole
 * word in `theme` or `news_one_liner`. The single strongest "this row is
 * about the symbol" signal.
 */
const WEIGHT_TEXT_TOKEN = 2;

/**
 * +2 when `affected_tickers[0]` is one of the symbol's aliases. The curator
 * tends to put the primary subject first in the array, so position-1
 * combined with even one supporting signal clears the default threshold.
 *
 * Slice 3: this weight is only used as a **fallback** when
 * `primarySource` is null/undefined. When upstream provides a
 * deterministic `primary_ticker`, the WEIGHT_PRIMARY_TICKER_* constants
 * below take priority (see the mutex in `computeSymbolAffinity`).
 */
const WEIGHT_POSITION_PRIMARY = 2;

/**
 * +3 when `primary_ticker` matches the digest symbol's alias set AND
 * `primary_ticker_source` is `"marketaux_entities"` (strong tier —
 * source-grounded, no LLM). Higher than WEIGHT_POSITION_PRIMARY because
 * the upstream signal is more trustworthy than the curator's implicit
 * "first ticker in array" convention.
 *
 * See docs/upstream-trust-map.md § Slice 2/3 for trust-tier definitions.
 */
const WEIGHT_PRIMARY_TICKER_STRONG = 3;

/**
 * +2 when `primary_ticker` matches the digest symbol's alias set AND
 * `primary_ticker_source` is `"batch_heuristic"` (heuristic tier —
 * deterministic majority vote but not source-grounded at the memory
 * layer). Same magnitude as WEIGHT_POSITION_PRIMARY because the signal
 * quality is comparable; it replaces rather than stacks on position.
 */
const WEIGHT_PRIMARY_TICKER_HEURISTIC = 2;

/**
 * Slice 4: −2 when `primary_ticker_source` is `"marketaux_entities"`
 * (strong tier) AND `primary_ticker` is non-null AND does NOT match the
 * digest symbol's alias set. Exactly cancels WEIGHT_TEXT_TOKEN so that a
 * row whose upstream subject is deterministically identified as a
 * *different* symbol cannot pass the affinity gate on a text mention
 * alone. Heuristic-tier mismatch stays at 0 (evidence-based decision —
 * see docs/upstream-trust-map.md § Slice 4).
 */
const WEIGHT_PRIMARY_TICKER_STRONG_MISS = -2;

/**
 * +1 when the row is narrowly tagged. Narrowly-tagged rows are usually about
 * the few tickers they list rather than co-mentions; the bonus rewards
 * focused themes without making them automatic winners.
 */
const WEIGHT_NARROW_TAG = 1;

/**
 * −1 when the row is over-broad. Rows tagged with eight or more tickers
 * (e.g. the 14-ticker "US-Iran War Escalation" theme observed in prod) are
 * macro at best — never per-symbol context.
 */
const WEIGHT_BROAD_TAG = -1;

/** `array_length(affected_tickers) <= NARROW_TAG_MAX` triggers the narrow bonus. */
const NARROW_TAG_MAX = 3;

/** `array_length(affected_tickers) >= BROAD_TAG_MIN` triggers the broad penalty. */
const BROAD_TAG_MIN = 8;

/**
 * Minimum score for a candidate row to be context-eligible. Default 2.
 * Overridable via `SMART_DIGEST_MEMORY_AFFINITY_MIN`. Clamped to a sane
 * range so a typo cannot disable the gate or push it past the maximum
 * achievable score in the current weight scheme.
 */
const DEFAULT_AFFINITY_MIN = 2;
const AFFINITY_MIN_FLOOR = 0;
const AFFINITY_MIN_CEILING = 10;

/**
 * Slice 6: penalty applied when the digest symbol appears ONLY in
 * `tickers_inferred` (boilerplate dropped by Slice 5 sanitizer) and NOT
 * in `affected_tickers`. Default 0 — no behavior change unless the env
 * knob `SMART_DIGEST_INFERRED_ONLY_PENALTY` is set to a negative value.
 * Clamped to `[INFERRED_ONLY_PENALTY_FLOOR, INFERRED_ONLY_PENALTY_CEILING]`.
 */
const WEIGHT_INFERRED_ONLY_ATTACHMENT_DEFAULT = 0;
const INFERRED_ONLY_PENALTY_FLOOR = -5;
const INFERRED_ONLY_PENALTY_CEILING = 0;

/**
 * Tickers <= TICKER_CASE_SENSITIVE_MAX_LEN match as exact uppercase whole
 * words. Above the cutoff, we relax to case-insensitive whole-word match.
 *
 * Reason: short tickers like `F` (Ford) or `T` (AT&T) appear too easily as
 * lowercase words in English; an uppercase-only requirement avoids
 * "Ford-150" matching as `\bF\b` against random lowercase prose, while
 * still matching the way curated themes actually write tickers.
 */
const TICKER_CASE_SENSITIVE_MAX_LEN = 4;

import type { PrimaryTickerSource } from "./primary-ticker.js";

// ── Public types ──────────────────────────────────────────────────────

export type AttachmentKind = "kept" | "inferred_only" | "both" | "none";

export interface AffinityResult {
  /** Sum of bonus/penalty weights applied. */
  score: number;
  /**
   * Stable, debug-friendly codes that explain `score`. Order is the order
   * in which checks ran; identical inputs always yield identical reason
   * arrays so the debug surface and tests can pattern-match without
   * re-scoring.
   */
  reasons: string[];
  /** True iff `score >= threshold`. */
  passed: boolean;
  /** Threshold the row was compared against. Echoed for inspectability. */
  threshold: number;
  /**
   * Slice 6: how the digest symbol relates to the row's ticker arrays.
   *   - `kept`          — symbol is in `affected_tickers` (normal path)
   *   - `inferred_only` — symbol is only in `tickers_inferred` (boilerplate)
   *   - `both`          — in both arrays (defensive; should not happen post-Slice-5)
   *   - `none`          — symbol is in neither array
   */
  attachmentKind: AttachmentKind;
}

export interface ComputeSymbolAffinityArgs {
  /** `analysis_market_memory.theme` (raw, may be null). */
  theme: string | null | undefined;
  /** `analysis_market_memory.news_one_liner` (raw, may be null). */
  newsOneLiner: string | null | undefined;
  /** `analysis_market_memory.affected_tickers`. Empty array if missing. */
  affectedTickers: string[];
  /** Uppercase digest symbol (`BTC/USD`, `AAPL`, `SPX500`, …). */
  symbolUpper: string;
  /**
   * Pre-computed alias set for the symbol — typically the result of
   * `newsLookupCandidateSymbols(symbol).map(s => s.toUpperCase())`. Passed
   * in (rather than re-computed) so callers that already loaded the alias
   * set per digest symbol can reuse it across many candidate rows.
   */
  aliases: string[];
  /**
   * Slice 3: upstream deterministic primary-subject ticker. When
   * `primarySource` is non-null this replaces the position-primary
   * heuristic (mutex, not additive). When null/undefined the legacy
   * `affected_tickers[0]` fallback fires unchanged.
   */
  primaryTicker?: string | null;
  /**
   * Slice 3/4: trust tier of `primaryTicker`. Determines the weight on
   * match: `"marketaux_entities"` → +3 hit / −2 miss (strong),
   * `"batch_heuristic"` → +2 hit / 0 miss (heuristic),
   * null/undefined → legacy position-primary fallback.
   */
  primarySource?: PrimaryTickerSource;
  /**
   * Slice 6: tickers dropped from `affected_tickers` by the Slice 5
   * sanitizer and preserved in `analysis_market_memory.tickers_inferred`.
   * Empty array when absent or for pre-Slice-5 rows.
   */
  tickersInferred?: string[];
  /**
   * Optional override for tests; production calls always go through
   * `getAffinityMin()`.
   */
  threshold?: number;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Read the affinity threshold from the environment. Falls back to
 * `DEFAULT_AFFINITY_MIN` when the env is unset/empty/non-numeric, and
 * clamps everything else to `[AFFINITY_MIN_FLOOR, AFFINITY_MIN_CEILING]`
 * so a typo can neither disable the gate (`-1`) nor demand impossible
 * scores (`999`).
 *
 * Mirrors the pattern of `getMemoryFreshnessHours()` in
 * `digest-brief-truth.ts`.
 */
export function getAffinityMin(): number {
  const raw = process.env["SMART_DIGEST_MEMORY_AFFINITY_MIN"];
  if (raw === undefined || raw === "") return DEFAULT_AFFINITY_MIN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_AFFINITY_MIN;
  return Math.min(
    AFFINITY_MIN_CEILING,
    Math.max(AFFINITY_MIN_FLOOR, parsed),
  );
}

/**
 * Slice 6: read the inferred-only attachment penalty from the environment.
 * Falls back to `WEIGHT_INFERRED_ONLY_ATTACHMENT_DEFAULT` (0) when the env
 * is unset/empty/non-numeric, and clamps to
 * `[INFERRED_ONLY_PENALTY_FLOOR, INFERRED_ONLY_PENALTY_CEILING]` so only
 * non-positive values are accepted.
 */
export function getInferredOnlyPenalty(): number {
  const raw = process.env["SMART_DIGEST_INFERRED_ONLY_PENALTY"];
  if (raw === undefined || raw === "") return WEIGHT_INFERRED_ONLY_ATTACHMENT_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return WEIGHT_INFERRED_ONLY_ATTACHMENT_DEFAULT;
  return Math.min(
    INFERRED_ONLY_PENALTY_CEILING,
    Math.max(INFERRED_ONLY_PENALTY_FLOOR, parsed),
  );
}

/**
 * Slice 7B: when true, fetchers also pull rows whose digest-symbol alias
 * appears only in `tickers_inferred` (i.e. tickers dropped by the Slice 5
 * sanitizer). Default false — no behavior change until explicitly enabled.
 * Truthy values: "true", "TRUE", "1". Everything else (including "yes",
 * "0", empty, non-string-coerced values) returns false.
 */
export function getIncludeInferredOnly(): boolean {
  const raw = process.env["SMART_DIGEST_INCLUDE_INFERRED_ONLY"];
  if (raw === undefined || raw === "") return false;
  const v = raw.toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Score a single `(memory_row, digest_symbol)` pair. Pure: no I/O, no
 * mutation, no globals. Same inputs always produce identical
 * `{score, reasons, passed, threshold, attachmentKind}`.
 */
export function computeSymbolAffinity(
  args: ComputeSymbolAffinityArgs,
): AffinityResult {
  const reasons: string[] = [];
  let score = 0;

  const aliasSet = new Set(args.aliases.map((a) => a.toUpperCase()));
  aliasSet.add(args.symbolUpper.toUpperCase());

  const aliasList = [...aliasSet];

  const tickers = Array.isArray(args.affectedTickers) ? args.affectedTickers : [];
  const inferred = Array.isArray(args.tickersInferred) ? args.tickersInferred : [];

  // 0. Slice 6: classify attachment kind before scoring.
  const keptHit = findFirstAliasHit(tickers, aliasSet);
  const inferredHit = findFirstAliasHit(inferred, aliasSet);
  const attachmentKind: AttachmentKind =
    keptHit && inferredHit ? "both"
    : keptHit ? "kept"
    : inferredHit ? "inferred_only"
    : "none";

  for (const t of inferred) {
    const u = (t ?? "").toUpperCase();
    if (u) reasons.push(`inferred_ticker_present:${u}`);
  }

  // 1. Text-token bonus — strongest signal that the row is on-symbol.
  const textBlob = `${args.theme ?? ""}\n${args.newsOneLiner ?? ""}`;
  const textHit = findFirstTokenHit(textBlob, aliasList);
  if (textHit) {
    score += WEIGHT_TEXT_TOKEN;
    reasons.push(`text_token_hit:${textHit}`);
  } else {
    reasons.push("text_token_miss");
  }

  // 2. Subject-primary signal — upstream-first mutex.
  //
  //    Slice 6: when the symbol is only in tickers_inferred (inferred_only
  //    attachment), the primary-ticker and position-primary branches are
  //    meaningless — the symbol was dropped from affected_tickers by the
  //    sanitizer. Instead, emit the inferred-only attachment code and apply
  //    the (default-zero) penalty.
  const primarySource = args.primarySource ?? null;

  if (attachmentKind === "inferred_only") {
    const penalty = getInferredOnlyPenalty();
    if (penalty !== 0) {
      score += penalty;
    }
    reasons.push(`attachment_inferred_only:${inferredHit}`);
  } else if (primarySource === "marketaux_entities" || primarySource === "batch_heuristic") {
    const tier = primarySource === "marketaux_entities" ? "strong" : "heuristic";
    const hitWeight = primarySource === "marketaux_entities"
      ? WEIGHT_PRIMARY_TICKER_STRONG
      : WEIGHT_PRIMARY_TICKER_HEURISTIC;
    const missWeight = primarySource === "marketaux_entities"
      ? WEIGHT_PRIMARY_TICKER_STRONG_MISS
      : 0;
    const pt = (args.primaryTicker ?? "").toUpperCase() || null;
    if (pt === null) {
      reasons.push(`primary_ticker_unknown:${tier}`);
    } else if (aliasSet.has(pt)) {
      score += hitWeight;
      reasons.push(`primary_ticker_hit:${tier}:${pt}`);
    } else {
      score += missWeight;
      reasons.push(`primary_ticker_miss:${tier}:${pt}`);
    }
  } else {
    const firstTicker = tickers[0]?.toUpperCase();
    const positionMatch = firstTicker && aliasSet.has(firstTicker)
      ? firstTicker
      : null;
    if (positionMatch) {
      score += WEIGHT_POSITION_PRIMARY;
      reasons.push(`position_primary_hit:${positionMatch}`);
    } else {
      const symbolPosition = findSymbolPosition(tickers, aliasSet);
      if (symbolPosition === -1) {
        reasons.push("position_primary_miss:not_in_tickers");
      } else {
        reasons.push(`position_primary_miss:position=${symbolPosition + 1}`);
      }
    }
  }

  // 3. Cardinality shaping — reward focused themes, penalise over-broad ones.
  const n = tickers.length;
  if (n <= NARROW_TAG_MAX && n > 0) {
    score += WEIGHT_NARROW_TAG;
    reasons.push(`narrow_tag_bonus:n=${n}`);
  } else if (n >= BROAD_TAG_MIN) {
    score += WEIGHT_BROAD_TAG;
    reasons.push(`broad_tag_penalty:n=${n}`);
  } else {
    reasons.push(`normal_tag:n=${n}`);
  }

  const threshold = args.threshold ?? getAffinityMin();
  return {
    score,
    reasons,
    passed: score >= threshold,
    threshold,
    attachmentKind,
  };
}

// ── Public helpers (reused by ranking/surfacing layers) ──────────────

/**
 * True iff `text` contains any of the digest symbol's aliases as a
 * whole word, using the same case-aware matching rules as the affinity
 * scorer. Re-exported so the Step-5 association ranker and surfacing
 * scorer can ask the same on-symbol question against an arbitrary text
 * field (typically `news_one_liner`) without duplicating regex logic.
 *
 * `aliases` should already be uppercase; pass the same alias list used
 * for `computeSymbolAffinity`.
 */
export function textMentionsAnyAlias(
  text: string | null | undefined,
  aliases: string[],
): boolean {
  if (!text) return false;
  return findFirstTokenHit(text, aliases) !== null;
}

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Return the first ticker in `arr` that is a member of `aliasSet`
 * (case-insensitive), or `null` when none match.
 */
function findFirstAliasHit(
  arr: ReadonlyArray<string>,
  aliasSet: Set<string>,
): string | null {
  for (const t of arr) {
    const u = (t ?? "").toUpperCase();
    if (u && aliasSet.has(u)) return u;
  }
  return null;
}

/**
 * Find the first alias that matches the text as a whole word. Match rules:
 *
 *   - Tickers <= `TICKER_CASE_SENSITIVE_MAX_LEN` chars: exact uppercase
 *     whole-word match. Stops `\bF\b` from grabbing every lowercase `f` in
 *     prose.
 *   - Tickers > the cutoff: case-insensitive whole-word match.
 *   - Pair aliases (e.g. `BTC/USD`) are tried as literal whole-word
 *     matches with the slash escaped; rare but observed in some themes.
 *
 * Returns the matched alias string for logging, or `null` if nothing hit.
 */
function findFirstTokenHit(text: string, aliases: string[]): string | null {
  if (text.length === 0) return null;
  for (const alias of aliases) {
    const a = alias.toUpperCase();
    if (a.length === 0) continue;
    const pattern = buildTokenRegex(a);
    if (pattern.test(text)) return a;
  }
  return null;
}

function buildTokenRegex(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  if (token.length <= TICKER_CASE_SENSITIVE_MAX_LEN) {
    return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`);
  }
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
}

/**
 * Position (0-based) of the first ticker that matches one of the symbol
 * aliases, or `-1` when no alias appears in `affected_tickers`.
 */
function findSymbolPosition(
  affectedTickers: string[],
  aliasSet: Set<string>,
): number {
  for (let i = 0; i < affectedTickers.length; i++) {
    const t = (affectedTickers[i] ?? "").toUpperCase();
    if (aliasSet.has(t)) return i;
  }
  return -1;
}
