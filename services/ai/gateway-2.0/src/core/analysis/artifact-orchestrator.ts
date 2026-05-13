import type { FastifyBaseLogger } from "fastify";
import { classifyArtifactError } from "./artifact-errors.js";
import type { ArtifactType } from "./artifact-errors.js";
import { makeArtifactRunLogger, type RunContext } from "./artifact-logging.js";

// ── Types ─────────────────────────────────────────────────────────────

export type ArtifactJobSource =
  | "reuse"
  | "fresh"
  | "slot_conflict_reused"
  | "slot_conflict_fallback"
  | "fallback";

export interface JobSpec<Hashes, Brief> {
  artifactType: ArtifactType;
  runCtx: RunContext;
  baseLog: FastifyBaseLogger;
  slotKey: Record<string, string>;

  computeHashes: () => Promise<Hashes>;
  tryReuse: (h: Hashes) => Promise<{ id: number; externalId: string; brief: Brief } | null>;
  acquireSlot: (h: Hashes) => Promise<{ id: number; externalId: string } | null>;
  markGenerating: (id: number) => Promise<boolean>;
  generate: () => Promise<Brief>;
  markReady: (id: number, brief: Brief) => Promise<void>;
  markFailed: (id: number, code: string, err: unknown) => Promise<void>;
  buildFallback?: () => Promise<Brief>;
  conflictBackoffMs?: number;
}

export interface JobResult<Brief> {
  source: ArtifactJobSource;
  artifactId?: number;
  externalId?: string;
  brief?: Brief;
  attempt: number;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryConflictReuse<H, B>(
  spec: JobSpec<H, B>,
  hashes: H,
  t0: number,
): Promise<JobResult<B> | null> {
  const r = await spec.tryReuse(hashes);
  if (r) {
    return {
      source: "slot_conflict_reused",
      artifactId: r.id,
      externalId: r.externalId,
      brief: r.brief,
      attempt: 1,
      durationMs: Date.now() - t0,
    };
  }
  return null;
}

async function conflictFallback<H, B>(
  spec: JobSpec<H, B>,
  t0: number,
): Promise<JobResult<B>> {
  if (spec.buildFallback) {
    return {
      source: "slot_conflict_fallback",
      brief: await spec.buildFallback(),
      attempt: 1,
      durationMs: Date.now() - t0,
    };
  }
  return { source: "slot_conflict_fallback", attempt: 1, durationMs: Date.now() - t0 };
}

// ── Core orchestrator ─────────────────────────────────────────────────

const DEFAULT_CONFLICT_BACKOFF_MS = 250;

export async function runArtifactJob<H, B>(
  spec: JobSpec<H, B>,
): Promise<JobResult<B>> {
  const log = makeArtifactRunLogger({
    baseLog: spec.baseLog,
    runCtx: spec.runCtx,
    slotKey: spec.slotKey,
  });
  const t0 = Date.now();

  const hashes = await spec.computeHashes();

  const reused = await spec.tryReuse(hashes);
  if (reused) {
    log.info({ artifactId: reused.id, externalId: reused.externalId }, "reuse_hit");
    return {
      source: "reuse",
      artifactId: reused.id,
      externalId: reused.externalId,
      brief: reused.brief,
      attempt: 0,
      durationMs: Date.now() - t0,
    };
  }

  const slot = await spec.acquireSlot(hashes);
  if (!slot) {
    log.warn({}, "slot_conflict_acquire");
    await delay(spec.conflictBackoffMs ?? DEFAULT_CONFLICT_BACKOFF_MS);
    const r = await tryConflictReuse(spec, hashes, t0);
    if (r) return r;
    return conflictFallback(spec, t0);
  }

  const casOk = await spec.markGenerating(slot.id);
  if (!casOk) {
    log.warn({ artifactId: slot.id }, "mark_generating_cas_lost");
    const r = await tryConflictReuse(spec, hashes, t0);
    if (r) return r;
    return conflictFallback(spec, t0);
  }

  try {
    const brief = await spec.generate();
    await spec.markReady(slot.id, brief);
    log.info({ artifactId: slot.id, externalId: slot.externalId }, "artifact_ready");
    return {
      source: "fresh",
      artifactId: slot.id,
      externalId: slot.externalId,
      brief,
      attempt: 1,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    const code = classifyArtifactError(err, { artifactType: spec.artifactType });
    await spec.markFailed(slot.id, code, err);
    log.error({ err, artifactId: slot.id, errorCode: code }, "generation_failed");
    if (spec.buildFallback) {
      return {
        source: "fallback",
        brief: await spec.buildFallback(),
        attempt: 1,
        durationMs: Date.now() - t0,
      };
    }
    return { source: "fallback", attempt: 1, durationMs: Date.now() - t0 };
  }
}
