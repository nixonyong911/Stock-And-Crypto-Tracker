import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";
import { runArtifactJob, type JobResult } from "./artifact-orchestrator.js";
import type { RunContext } from "./artifact-logging.js";
import { buildTriggerReason } from "./artifact-trigger.js";
import {
  getCurrentArtifact,
  acquireInFlightSlot,
  markGenerating,
  markReady,
  markFailed,
} from "./smart-digest-repository.js";
import {
  computeTruthFingerprint,
  computeContextFingerprint,
  CURRENT_DIGEST_BRIEF_SCHEMA_VERSION,
  CURRENT_GENERATOR_VERSION,
  CURRENT_PROMPT_VERSION,
  CURRENT_CODE_VERSION,
} from "./smart-digest-fingerprint.js";
import { evaluateTriggers, type DigestMode } from "./digest-trigger.js";
import {
  generateDigestBrief,
  type DigestBrief,
} from "./digest-brief-generator.js";
import {
  buildActionGuideFacts,
  generateLlmActionGuide,
} from "./action-guide-llm.js";
import type {
  TickerSignal,
  MacroContext,
  TickerMemoryText,
  AnalystMix,
  StockCardExtras,
  TechLevels,
} from "./recommendation-engine.js";
import type { BriefMode } from "./digest-brief-truth.js";

export interface DigestOrchestrationDeps {
  db: Pool;
  log: FastifyBaseLogger;
  briefMode?: BriefMode;
}

export interface DigestOrchestrationContext {
  macroContext: MacroContext;
  newsOneLinerMap?: Map<string, string>;
  memoryTextMap?: Map<string, TickerMemoryText>;
  analysisDateMap?: Map<string, string>;
  analystMixMap?: Map<string, AnalystMix>;
  cardExtrasMap?: Map<string, StockCardExtras>;
  techLevelsMap?: Map<string, TechLevels>;
}

export async function orchestrateDigestArtifact(
  deps: DigestOrchestrationDeps,
  runCtx: RunContext,
  symbol: string,
  assetType: "stock" | "crypto",
  signals: TickerSignal[],
  context: DigestOrchestrationContext,
): Promise<JobResult<DigestBrief>> {
  const briefMode = deps.briefMode ?? "strict";
  const primary = signals[0];
  const triggerReason = buildTriggerReason("signal", "intraday", {
    signalType: primary?.type,
  });

  return runArtifactJob<{ truth: string; context: string }, DigestBrief>({
    artifactType: "smart_digest",
    runCtx,
    baseLog: deps.log,
    slotKey: { symbol, assetType, briefMode },
    conflictBackoffMs: 250,

    computeHashes: async () => ({
      truth: (await computeTruthFingerprint(deps.db, symbol, assetType)).hash,
      context: (await computeContextFingerprint(deps.db, symbol)).hash,
    }),

    tryReuse: async (h) => {
      const r = await getCurrentArtifact({
        db: deps.db,
        symbol,
        assetType,
        briefMode,
        truthHash: h.truth,
        contextHash: h.context,
        schemaVersion: CURRENT_DIGEST_BRIEF_SCHEMA_VERSION,
        generatorVersion: CURRENT_GENERATOR_VERSION,
        promptVersion: CURRENT_PROMPT_VERSION,
        maxAgeMs: 24 * 60 * 60 * 1000,
      });
      return r
        ? { id: r.id, externalId: r.digest_id, brief: r.payload as unknown as DigestBrief }
        : null;
    },

    acquireSlot: async (h) => {
      const slots = evaluateTriggers({
        now: new Date(),
        modes: ["intraday" as DigestMode],
        triggerReason,
        demand: [{ symbol, assetType }],
        briefMode,
      });
      const s = slots[0];
      if (!s) return null;
      const row = await acquireInFlightSlot({
        db: deps.db,
        symbol: s.symbol,
        assetType: s.assetType,
        digestDate: s.digestDate,
        mode: s.mode,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        triggerReason: s.triggerReason,
        briefMode: s.briefMode,
        truthHash: h.truth,
        contextHash: h.context,
        schemaVersion: CURRENT_DIGEST_BRIEF_SCHEMA_VERSION,
        generatorVersion: CURRENT_GENERATOR_VERSION,
        promptVersion: CURRENT_PROMPT_VERSION,
        codeVersion: CURRENT_CODE_VERSION,
      });
      return row ? { id: row.id, externalId: row.digest_id } : null;
    },

    markGenerating: (id) => markGenerating(deps.db, id),

    generate: async () => {
      const brief = generateDigestBrief({
        signals,
        symbol,
        macroContext: context.macroContext,
        newsOneLinerMap: context.newsOneLinerMap,
        memoryTextMap: context.memoryTextMap,
        analysisDateMap: context.analysisDateMap,
        analystMixMap: context.analystMixMap,
        cardExtrasMap: context.cardExtrasMap,
        techLevelsMap: context.techLevelsMap,
        mode: briefMode,
      });

      // LLM polish of the action guide. Runs once per (symbol, fact-change)
      // because the result lands in the cached artifact payload; any
      // failure keeps the deterministic sentence.
      brief.actionGuideSource = "deterministic";
      const upper = symbol.toUpperCase();
      const facts = buildActionGuideFacts({
        brief,
        extras: context.cardExtrasMap?.get(upper),
        newsOneLiner: context.newsOneLinerMap?.get(upper),
        macroTheme: context.macroContext.dominantTheme ?? undefined,
      });
      const llmGuide = await generateLlmActionGuide(facts, deps.log);
      if (llmGuide) {
        brief.actionGuide = llmGuide;
        brief.actionGuideSource = "llm";
      }

      return brief;
    },

    markReady: async (id, brief) => {
      await markReady({
        db: deps.db,
        id,
        payload: brief as unknown as Record<string, unknown>,
        title: primary?.headline ?? null,
        summary: brief.whatHappening,
        primarySignalType: primary?.type ?? null,
        confidence: brief.confidence,
        stanceLabel: brief.status.label,
        stanceTone: brief.status.tone,
        truthRefs: {},
      });
    },

    markFailed: async (id, code, err) => {
      await markFailed({
        db: deps.db,
        id,
        errorCode: code,
        errorMessage: String(err instanceof Error ? err.message : err).slice(0, 1024),
        errorStack: String(err instanceof Error ? err.stack : "").slice(0, 4096),
      });
    },
  });
}
