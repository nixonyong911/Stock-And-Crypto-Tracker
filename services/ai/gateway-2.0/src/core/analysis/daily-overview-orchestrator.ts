import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";
import { runArtifactJob, type JobResult } from "./artifact-orchestrator.js";
import type { RunContext } from "./artifact-logging.js";
import { buildTriggerReason, type ArtifactTriggerSource } from "./artifact-trigger.js";
import {
  getCurrentOverviewArtifact,
  acquireOverviewSlot,
  markOverviewGenerating,
  markOverviewReady,
  markOverviewFailed,
} from "./daily-overview-repository.js";
import {
  computeOverviewSnapshotHash,
  computeOverviewContextHash,
  projectSnapshotRefs,
  gatherContextRefs,
  CURRENT_OVERVIEW_SCHEMA_VERSION,
  CURRENT_OVERVIEW_GENERATOR_VERSION,
  CURRENT_OVERVIEW_PROMPT_VERSION,
  CURRENT_OVERVIEW_MODEL,
  CURRENT_CODE_VERSION,
} from "./daily-overview-fingerprint.js";
import {
  synthesizeOverviewCore,
  buildTemplateFallbackNarrative,
  fetchPriorOverviews,
  fetchStockPriceTrajectory,
  fetchCryptoPriceTrajectory,
  type MarketSnapshot,
} from "./market-overview.js";

const TRAJECTORY_SYMBOLS = ["SPX500", "OIL"];
const TRAJECTORY_CRYPTO = ["BTC/USD", "ETH/USD"];
const HISTORY_DAYS = 7;

export interface OverviewSynthesis {
  narrative: string;
  topStories: string[];
  synthesisSource: "llm" | "template_fallback";
  durationMs: number | null;
}

export interface OverviewOrchestrationDeps {
  db: Pool;
  log: FastifyBaseLogger;
  triggerSource?: ArtifactTriggerSource;
}

export async function orchestrateDailyOverviewArtifact(
  deps: OverviewOrchestrationDeps,
  runCtx: RunContext,
  snapshot: MarketSnapshot,
  sessionType: "pre_market" | "post_close",
  dateStr: string,
): Promise<JobResult<OverviewSynthesis>> {
  const locale = "en";
  const triggerReason = buildTriggerReason(
    deps.triggerSource ?? "cron",
    sessionType,
  );

  return runArtifactJob<{ snapshot: string; context: string }, OverviewSynthesis>({
    artifactType: "daily_overview",
    runCtx,
    baseLog: deps.log,
    slotKey: { overviewDate: dateStr, sessionType, locale },
    conflictBackoffMs: 250,

    computeHashes: async () => ({
      snapshot: computeOverviewSnapshotHash(snapshot),
      context: computeOverviewContextHash(
        await gatherContextRefs(deps.db, sessionType),
      ),
    }),

    tryReuse: async (h) => {
      const r = await getCurrentOverviewArtifact({
        db: deps.db,
        overviewDate: dateStr,
        sessionType,
        locale,
        snapshotHash: h.snapshot,
        contextHash: h.context,
        schemaVersion: CURRENT_OVERVIEW_SCHEMA_VERSION,
        generatorVersion: CURRENT_OVERVIEW_GENERATOR_VERSION,
        promptVersion: CURRENT_OVERVIEW_PROMPT_VERSION,
        modelName: CURRENT_OVERVIEW_MODEL,
      });
      return r
        ? {
            id: r.id,
            externalId: r.overview_id,
            brief: {
              narrative: r.narrative ?? "",
              topStories: (r.top_stories as string[] | null) ?? [],
              synthesisSource: r.synthesis_source as "llm" | "template_fallback",
              durationMs: r.llm_duration_ms,
            },
          }
        : null;
    },

    acquireSlot: async (h) => {
      const row = await acquireOverviewSlot({
        db: deps.db,
        overviewDate: dateStr,
        sessionType,
        locale,
        triggerReason,
        snapshotRefs: projectSnapshotRefs(snapshot) as unknown as Record<string, unknown>,
        snapshotHash: h.snapshot,
        contextHash: h.context,
        schemaVersion: CURRENT_OVERVIEW_SCHEMA_VERSION,
        generatorVersion: CURRENT_OVERVIEW_GENERATOR_VERSION,
        promptVersion: CURRENT_OVERVIEW_PROMPT_VERSION,
        modelName: CURRENT_OVERVIEW_MODEL,
        codeVersion: CURRENT_CODE_VERSION,
      });
      return row ? { id: row.id, externalId: row.overview_id } : null;
    },

    markGenerating: (id) => markOverviewGenerating(deps.db, id),

    generate: async () => {
      const [priorOverviews, stockTrajectory, cryptoTrajectory] = await Promise.all([
        fetchPriorOverviews(deps.db, HISTORY_DAYS).catch(() => []),
        fetchStockPriceTrajectory(deps.db, TRAJECTORY_SYMBOLS, HISTORY_DAYS).catch(() => []),
        fetchCryptoPriceTrajectory(deps.db, TRAJECTORY_CRYPTO, HISTORY_DAYS).catch(() => []),
      ]);
      const core = await synthesizeOverviewCore({
        snapshot,
        priorOverviews,
        stockTrajectory,
        cryptoTrajectory,
        model: CURRENT_OVERVIEW_MODEL,
        log: deps.log,
      });
      if (!core) {
        return {
          narrative: buildTemplateFallbackNarrative(snapshot),
          topStories: [] as string[],
          synthesisSource: "template_fallback" as const,
          durationMs: null,
        };
      }
      return {
        narrative: core.narrative,
        topStories: core.topStories,
        synthesisSource: "llm" as const,
        durationMs: core.durationMs,
      };
    },

    markReady: async (id, b) => {
      await markOverviewReady({
        db: deps.db,
        id,
        synthesisSource: b.synthesisSource,
        payload: {
          synthesis: { narrative: b.narrative, topStories: b.topStories },
          sessionType,
        },
        narrative: b.narrative,
        topStories: b.topStories,
        llmDurationMs: b.durationMs,
      });
    },

    markFailed: async (id, code, err) => {
      await markOverviewFailed({
        db: deps.db,
        id,
        errorCode: code,
        errorMessage: String((err as Error)?.message ?? err).slice(0, 1024),
        errorStack: String((err as Error)?.stack ?? "").slice(0, 4096),
      });
    },

    buildFallback: async () => ({
      narrative: buildTemplateFallbackNarrative(snapshot),
      topStories: [] as string[],
      synthesisSource: "template_fallback" as const,
      durationMs: null,
    }),
  });
}
