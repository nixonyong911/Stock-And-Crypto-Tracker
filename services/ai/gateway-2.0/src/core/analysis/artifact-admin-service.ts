import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";

import type { SmartDigestRow, SmartDigestStatus, GetCurrentArtifactParams } from "./smart-digest-repository.js";
import type { DailyOverviewRow, DailyOverviewStatus, GetCurrentOverviewParams } from "./daily-overview-repository.js";

import * as sdRepo from "./smart-digest-repository.js";
import * as dovRepo from "./daily-overview-repository.js";

// ── Types ─────────────────────────────────────────────────────────────

export type ArtifactKind = "smart_digest" | "daily_overview";
export type ArtifactRow = SmartDigestRow | DailyOverviewRow;

export function isValidKind(v: string): v is ArtifactKind {
  return v === "smart_digest" || v === "daily_overview";
}

// ── getArtifactById ───────────────────────────────────────────────────

export async function getArtifactById(
  db: Pool,
  kind: ArtifactKind,
  id: number,
): Promise<ArtifactRow | null> {
  return kind === "smart_digest"
    ? sdRepo.selectById(db, id)
    : dovRepo.selectOverviewById(db, id);
}

// ── listInflightArtifacts ─────────────────────────────────────────────

export async function listInflightArtifacts(
  db: Pool,
  kind: ArtifactKind,
  opts: { olderThanMs?: number; limit?: number } = {},
): Promise<ArtifactRow[]> {
  return kind === "smart_digest"
    ? sdRepo.listInflight(db, opts)
    : dovRepo.listInflightOverviews(db, opts);
}

// ── listRecentArtifacts ───────────────────────────────────────────────

export async function listRecentArtifacts(
  db: Pool,
  kind: ArtifactKind,
  opts: {
    symbol?: string;
    sessionType?: string;
    status?: string;
    summary?: boolean;
    limit?: number;
  } = {},
): Promise<ArtifactRow[]> {
  if (kind === "daily_overview") {
    return dovRepo.listRecentOverviews(db, {
      sessionType: opts.sessionType,
      status: opts.status as DailyOverviewStatus | undefined,
      summary: opts.summary,
      limit: opts.limit,
    });
  }
  return sdRepo.listRecent(db, {
    symbol: opts.symbol,
    status: opts.status as SmartDigestStatus | undefined,
    summary: opts.summary,
    limit: opts.limit,
  });
}

// ── explainCurrentArtifact (smart_digest) ─────────────────────────────

export interface ExplainDigestParams {
  symbol: string;
  assetType: string;
  briefMode: string;
  truthHash: string;
  contextHash: string;
  schemaVersion: number;
  generatorVersion: string;
  promptVersion: string | null;
  maxAgeMs: number;
}

export interface ExplainOverviewParams {
  overviewDate: string;
  sessionType: string;
  locale: string;
  snapshotHash: string;
  contextHash: string;
  schemaVersion: number;
  generatorVersion: string;
  promptVersion: string;
  modelName: string;
}

interface CandidateSummary {
  id: number;
  artifactId: string;
  generatedAt: string | null;
}

interface SlotPeerSummary {
  id: number;
  artifactId: string;
  generatedAt: string | null;
  truthHash?: string;
  snapshotHash?: string;
  contextHash: string;
  schemaVersion: number;
  generatorVersion: string;
  promptVersion: string | null;
}

export interface ExplainResult {
  kind: ArtifactKind;
  inputs: Record<string, unknown>;
  current: CandidateSummary | null;
  candidates: CandidateSummary[];
  slotPeers: SlotPeerSummary[];
}

export async function explainCurrentDigest(
  db: Pool,
  params: ExplainDigestParams,
): Promise<ExplainResult> {
  const repoParams: GetCurrentArtifactParams & { candidateLimit?: number } = {
    db,
    ...params,
    candidateLimit: 5,
  };
  const candidates = await sdRepo.findCurrentCandidates(repoParams);
  const slotPeers = await sdRepo.findSlotPeers(db, {
    symbol: params.symbol,
    assetType: params.assetType,
    briefMode: params.briefMode,
    limit: 3,
  });

  const mapDigestCandidate = (r: SmartDigestRow): CandidateSummary => ({
    id: r.id,
    artifactId: r.digest_id,
    generatedAt: r.generated_at,
  });

  const mapDigestPeer = (r: SmartDigestRow): SlotPeerSummary => ({
    id: r.id,
    artifactId: r.digest_id,
    generatedAt: r.generated_at,
    truthHash: r.truth_hash,
    contextHash: r.context_hash,
    schemaVersion: r.schema_version,
    generatorVersion: r.generator_version,
    promptVersion: r.prompt_version,
  });

  return {
    kind: "smart_digest",
    inputs: { ...params },
    current: candidates[0] ? mapDigestCandidate(candidates[0]) : null,
    candidates: candidates.map(mapDigestCandidate),
    slotPeers: slotPeers.map(mapDigestPeer),
  };
}

export async function explainCurrentOverview(
  db: Pool,
  params: ExplainOverviewParams,
): Promise<ExplainResult> {
  const repoParams: GetCurrentOverviewParams & { candidateLimit?: number } = {
    db,
    ...params,
    candidateLimit: 5,
  };
  const candidates = await dovRepo.findCurrentOverviewCandidates(repoParams);
  const slotPeers = await dovRepo.findOverviewSlotPeers(db, {
    overviewDate: params.overviewDate,
    sessionType: params.sessionType,
    locale: params.locale,
    limit: 3,
  });

  const mapOvCandidate = (r: DailyOverviewRow): CandidateSummary => ({
    id: r.id,
    artifactId: r.overview_id,
    generatedAt: r.generated_at,
  });

  const mapOvPeer = (r: DailyOverviewRow): SlotPeerSummary => ({
    id: r.id,
    artifactId: r.overview_id,
    generatedAt: r.generated_at,
    snapshotHash: r.snapshot_hash,
    contextHash: r.context_hash,
    schemaVersion: r.schema_version,
    generatorVersion: r.generator_version,
    promptVersion: r.prompt_version,
  });

  return {
    kind: "daily_overview",
    inputs: { ...params },
    current: candidates[0] ? mapOvCandidate(candidates[0]) : null,
    candidates: candidates.map(mapOvCandidate),
    slotPeers: slotPeers.map(mapOvPeer),
  };
}

// ── invalidateArtifact ────────────────────────────────────────────────

export interface InvalidateResult {
  status: "ok" | "not_found" | "not_ready";
  row?: ArtifactRow;
}

export async function invalidateArtifact(
  deps: { db: Pool; log: FastifyBaseLogger },
  args: { kind: ArtifactKind; id: number; reason: string },
): Promise<InvalidateResult> {
  const row =
    args.kind === "smart_digest"
      ? await sdRepo.markInvalidated({ db: deps.db, id: args.id, reason: args.reason })
      : await dovRepo.markOverviewInvalidated({ db: deps.db, id: args.id, reason: args.reason });

  if (row) {
    deps.log.warn(
      { kind: args.kind, id: args.id, reason: args.reason, actor: "service-key" },
      "Artifact invalidated",
    );
    return { status: "ok", row };
  }

  const existing = await getArtifactById(deps.db, args.kind, args.id);
  return { status: existing ? "not_ready" : "not_found" };
}
