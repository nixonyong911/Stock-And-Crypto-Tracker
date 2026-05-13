/**
 * Smart Digest pipeline orchestrator.
 *
 * Composes the four Smart Digest layers in a top-down read:
 *   1. signal detection + Redis dedup     (this module)
 *   2. eligibility (watchers + throttle)  (`digest-eligibility.ts`)
 *   3. brief generation                    (`digest-brief-generator.ts`)
 *   4. card render                         (`digest-delivery.ts`)
 *   5. delivery + log                      (`digest-delivery.ts`)
 *
 * When `SMART_DIGEST_CANONICAL_ARTIFACT_ENABLED` is true, an additional
 * artifact-persist step runs between signal detection and fanout:
 *   - canonical artifact written to `analysis_smart_digest`
 *   - brief loaded from the persisted artifact for fanout
 * Delivery (`deliverSmartDigest` / `user_recommendation_log` INSERT)
 * is unchanged in either mode — artifact linkage is Step 15.
 *
 * `processRecommendations` is the entry point used by both
 * `/internal/check-recommendations` and the RabbitMQ pipeline consumer.
 */

import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import {
  detectSignals,
  type TickerSignal,
  type MacroContext,
  type TickerMemoryText,
} from "./recommendation-engine.js";
import { generateDigestBrief } from "./digest-brief-generator.js";
import type { BriefMode } from "./digest-brief-truth.js";
import { secondsUntilMidnightUTC } from "./wishlist-calculator.js";
import {
  listDigestWatchersForSymbol,
  checkDigestThrottle,
  recordDigestSent,
} from "./digest-eligibility.js";
import {
  renderSmartDigestCard,
  deliverSmartDigest,
} from "./digest-delivery.js";
import {
  getCurrentArtifact,
} from "./smart-digest-repository.js";
import {
  computeTruthFingerprint,
  computeContextFingerprint,
  CURRENT_DIGEST_BRIEF_SCHEMA_VERSION,
  CURRENT_GENERATOR_VERSION,
  CURRENT_PROMPT_VERSION,
} from "./smart-digest-fingerprint.js";
import { orchestrateDigestArtifact } from "./smart-digest-orchestrator.js";
import { newRunContext, type RunContext } from "./artifact-logging.js";
import type { DigestBrief } from "./digest-brief-generator.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface ProcessRecommendationsDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
  /**
   * Brief composition mode (`strict` default, `blended` allows DB-backed
   * memory text to enrich `whatHappening`). Optional — falls back to
   * `strict` when missing so the legacy callers do not break.
   */
  briefMode?: BriefMode;
  /** When true, persist canonical artifacts before fanout. */
  canonicalArtifactEnabled?: boolean;
}

// ── Entry point ───────────────────────────────────────────────────────

export async function processRecommendations(
  deps: ProcessRecommendationsDeps,
  assetType?: "stock" | "crypto",
): Promise<{ signals: number; sent: number }> {
  const { db, log } = deps;
  const types: Array<"stock" | "crypto"> = assetType
    ? [assetType]
    : ["stock", "crypto"];

  const runCtx = deps.canonicalArtifactEnabled
    ? newRunContext("smart_digest")
    : undefined;

  let totalSignals = 0;
  let totalSent = 0;

  for (const type of types) {
    const {
      signals,
      macroContext,
      newsOneLinerMap,
      memoryTextMap,
      analysisDateMap,
    } = await detectSignals(db, type);
    if (signals.length === 0) continue;

    log.info(
      { assetType: type, signalCount: signals.length },
      "Signals detected",
    );

    const newSignals = await filterDedupSignals(deps.redis, signals);
    if (newSignals.length === 0) continue;

    totalSignals += newSignals.length;

    const bySymbol = new Map<string, TickerSignal[]>();
    for (const s of newSignals) {
      let arr = bySymbol.get(s.symbol);
      if (!arr) {
        arr = [];
        bySymbol.set(s.symbol, arr);
      }
      arr.push(s);
    }

    if (deps.canonicalArtifactEnabled && runCtx) {
      await persistCanonicalArtifacts(deps, runCtx, type, bySymbol, {
        macroContext,
        newsOneLinerMap,
        memoryTextMap,
        analysisDateMap,
      });
    }

    for (const [symbol, tickerSignals] of bySymbol) {
      const sent = await fanOutToWatchers(
        deps,
        symbol,
        type,
        tickerSignals,
        macroContext,
        newsOneLinerMap,
        memoryTextMap,
        analysisDateMap,
      );
      totalSent += sent;
    }
  }

  return { signals: totalSignals, sent: totalSent };
}

// ── Pipeline-level signal dedup ───────────────────────────────────────

/**
 * Drop signals that have already been seen for the current UTC day. The
 * `digest:signal:<symbol>:<type>` key is set with TTL until midnight UTC.
 *
 * Uses a single atomic `SET NX EX` so that two concurrent pipeline
 * triggers can never both win the dedup for the same `(symbol, type)`.
 * The legacy `EXISTS` + `SET` pair was racy under concurrent RabbitMQ +
 * HTTP triggers and produced duplicate sends in production.
 *
 * This is a pipeline concern (which signals to process), not eligibility
 * (which users may receive them), so it stays here rather than in
 * `digest-eligibility.ts`.
 */
export async function filterDedupSignals(
  redis: Redis,
  signals: TickerSignal[],
): Promise<TickerSignal[]> {
  const ttl = secondsUntilMidnightUTC();
  const result: TickerSignal[] = [];

  for (const s of signals) {
    const key = `digest:signal:${s.symbol}:${s.type}`;
    const acquired = await redis.set(
      key,
      JSON.stringify({ direction: s.rawData.swingSignal }),
      "EX",
      ttl,
      "NX",
    );
    if (acquired === null) continue;
    result.push(s);
  }

  return result;
}

// ── Canonical artifact persistence (flag-gated) ──────────────────────

async function persistCanonicalArtifacts(
  deps: ProcessRecommendationsDeps,
  runCtx: RunContext,
  assetType: "stock" | "crypto",
  bySymbol: Map<string, TickerSignal[]>,
  context: {
    macroContext: MacroContext;
    newsOneLinerMap?: Map<string, string>;
    memoryTextMap?: Map<string, TickerMemoryText>;
    analysisDateMap?: Map<string, string>;
  },
): Promise<void> {
  const { log } = deps;

  for (const [symbol, signals] of bySymbol) {
    try {
      const result = await orchestrateDigestArtifact(
        { db: deps.db, log, briefMode: deps.briefMode },
        runCtx,
        symbol,
        assetType,
        signals,
        context,
      );
      if (result.source === "reuse") {
        log.info(
          { symbol, externalId: result.externalId, runId: runCtx.runId },
          "Reusing canonical artifact",
        );
      } else if (result.source === "fresh") {
        log.info(
          { symbol, artifactId: result.artifactId, externalId: result.externalId, runId: runCtx.runId },
          "Persisted canonical artifact",
        );
      }
    } catch (err) {
      log.error({ err, symbol, runId: runCtx.runId }, "Failed to persist canonical artifact");
    }
  }
}

// ── Per-symbol fan-out ────────────────────────────────────────────────

/**
 * For one symbol with one or more signals, render the card once and deliver
 * it to every eligible watcher. Eligibility (session + paired Telegram +
 * watchlist + prefs + cap) is fully owned by `digest-eligibility.ts`;
 * delivery (sendPhoto + log INSERT) is fully owned by `digest-delivery.ts`.
 *
 * When `canonicalArtifactEnabled` is true, the brief is loaded from the
 * canonical artifact row instead of in-memory generation. The
 * `deliverSmartDigest` call is NOT modified — same arguments, same
 * Telegram sendPhoto, same `user_recommendation_log` INSERT shape.
 */
async function fanOutToWatchers(
  deps: ProcessRecommendationsDeps,
  symbol: string,
  assetType: "stock" | "crypto",
  signals: TickerSignal[],
  macroContext: MacroContext,
  newsOneLinerMap?: Map<string, string>,
  memoryTextMap?: Map<string, TickerMemoryText>,
  analysisDateMap?: Map<string, string>,
): Promise<number> {
  const { db, redis, extensions, log } = deps;

  const watchers = await listDigestWatchersForSymbol({ db, redis }, symbol);
  if (watchers.length === 0) return 0;

  let brief: DigestBrief;

  if (deps.canonicalArtifactEnabled) {
    const briefMode = deps.briefMode ?? "strict";
    const { hash: truthHash } = await computeTruthFingerprint(db, symbol);
    const { hash: contextHash } = await computeContextFingerprint(db, symbol);

    const artifact = await getCurrentArtifact({
      db,
      symbol,
      assetType,
      briefMode,
      truthHash,
      contextHash,
      schemaVersion: CURRENT_DIGEST_BRIEF_SCHEMA_VERSION,
      generatorVersion: CURRENT_GENERATOR_VERSION,
      promptVersion: CURRENT_PROMPT_VERSION,
      maxAgeMs: 24 * 60 * 60 * 1000,
    });

    if (artifact) {
      brief = artifact.payload as unknown as DigestBrief;
    } else {
      brief = generateDigestBrief({
        signals,
        symbol,
        macroContext,
        newsOneLinerMap,
        memoryTextMap,
        analysisDateMap,
        mode: briefMode,
      });
    }
  } else {
    brief = generateDigestBrief({
      signals,
      symbol,
      macroContext,
      newsOneLinerMap,
      memoryTextMap,
      analysisDateMap,
      mode: deps.briefMode ?? "strict",
    });
  }

  const rendered = await renderSmartDigestCard(brief, log);
  const primary = signals[0]!;

  let sent = 0;
  for (const target of watchers) {
    try {
      const throttle = await checkDigestThrottle({ db, redis }, target.clerkUserId);
      if (!throttle.ok) continue;

      await recordDigestSent({ db, redis }, target.clerkUserId);

      await deliverSmartDigest(
        { db, extensions, log },
        target,
        brief,
        primary,
        rendered,
      );
      sent++;
    } catch (err) {
      log.error(
        { err, clerkUserId: target.clerkUserId, symbol },
        "Failed to record digest brief",
      );
    }
  }

  return sent;
}
