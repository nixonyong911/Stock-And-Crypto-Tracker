import type { Pool } from "pg";

// ── Types ─────────────────────────────────────────────────────────────

export type SmartDigestStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed"
  | "invalidated"
  | "superseded";

export interface SmartDigestRow {
  id: number;
  digest_id: string;
  symbol: string;
  asset_type: string;
  digest_date: string;
  mode: string;
  window_start: string;
  window_end: string;
  trigger_reason: string;
  brief_mode: string;
  payload: Record<string, unknown>;
  title: string | null;
  summary: string | null;
  primary_signal_type: string | null;
  confidence: string | null;
  stance_label: string | null;
  stance_tone: string | null;
  truth_refs: Record<string, unknown>;
  truth_hash: string;
  context_hash: string;
  schema_version: number;
  generator_version: string;
  prompt_version: string | null;
  code_version: string;
  model_name: string | null;
  status: SmartDigestStatus;
  attempt_number: number;
  requested_at: string;
  generation_started_at: string | null;
  generated_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  error_code: string | null;
  error_message: string | null;
  error_stack: string | null;
}

export interface GetCurrentArtifactParams {
  db: Pool;
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

export interface AcquireSlotParams {
  db: Pool;
  symbol: string;
  assetType: string;
  digestDate: string;
  mode: string;
  windowStart: Date;
  windowEnd: Date;
  triggerReason: string;
  briefMode: string;
  truthHash: string;
  contextHash: string;
  schemaVersion: number;
  generatorVersion: string;
  promptVersion: string | null;
  codeVersion: string;
  attemptNumber?: number;
}

export interface MarkReadyParams {
  db: Pool;
  id: number;
  payload: Record<string, unknown>;
  title: string | null;
  summary: string | null;
  primarySignalType: string | null;
  confidence: string | null;
  stanceLabel: string | null;
  stanceTone: string | null;
  truthRefs: Record<string, unknown>;
}

export interface MarkFailedParams {
  db: Pool;
  id: number;
  errorCode: string;
  errorMessage: string;
  errorStack: string;
}

// ── getCurrentArtifact ────────────────────────────────────────────────

export async function getCurrentArtifact(
  params: GetCurrentArtifactParams,
): Promise<SmartDigestRow | null> {
  const maxAgeInterval = `${Math.floor(params.maxAgeMs / 1000)} seconds`;
  const { rows } = await params.db.query<SmartDigestRow>(
    `SELECT *
     FROM analysis_smart_digest
     WHERE symbol = $1
       AND asset_type = $2
       AND brief_mode = $3
       AND status = 'ready'
       AND truth_hash = $4
       AND context_hash = $5
       AND schema_version = $6
       AND generator_version = $7
       AND prompt_version IS NOT DISTINCT FROM $8
       AND generated_at > NOW() - $9::interval
     ORDER BY generated_at DESC
     LIMIT 1`,
    [
      params.symbol,
      params.assetType,
      params.briefMode,
      params.truthHash,
      params.contextHash,
      params.schemaVersion,
      params.generatorVersion,
      params.promptVersion,
      maxAgeInterval,
    ],
  );
  return rows[0] ?? null;
}

// ── acquireInFlightSlot ───────────────────────────────────────────────

export async function acquireInFlightSlot(
  params: AcquireSlotParams,
): Promise<{ id: number; digest_id: string } | null> {
  try {
    const { rows } = await params.db.query<{ id: number; digest_id: string }>(
      `INSERT INTO analysis_smart_digest
       (symbol, asset_type, digest_date, mode, window_start, window_end,
        trigger_reason, brief_mode, truth_hash, context_hash, schema_version,
        generator_version, prompt_version, code_version, attempt_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
       RETURNING id, digest_id`,
      [
        params.symbol,
        params.assetType,
        params.digestDate,
        params.mode,
        params.windowStart,
        params.windowEnd,
        params.triggerReason,
        params.briefMode,
        params.truthHash,
        params.contextHash,
        params.schemaVersion,
        params.generatorVersion,
        params.promptVersion,
        params.codeVersion,
        params.attemptNumber ?? 1,
      ],
    );
    return rows[0] ?? null;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("uq_smart_digest_inflight")
    ) {
      return null;
    }
    throw err;
  }
}

// ── markGenerating ────────────────────────────────────────────────────

export async function markGenerating(
  db: Pool,
  id: number,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE analysis_smart_digest
     SET status = 'generating', generation_started_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ── markReady ─────────────────────────────────────────────────────────

export async function markReady(params: MarkReadyParams): Promise<boolean> {
  const { rowCount } = await params.db.query(
    `UPDATE analysis_smart_digest
     SET status = 'ready',
         generated_at = NOW(),
         payload = $2,
         title = $3,
         summary = $4,
         primary_signal_type = $5,
         confidence = $6,
         stance_label = $7,
         stance_tone = $8,
         truth_refs = $9
     WHERE id = $1 AND status IN ('pending', 'generating')`,
    [
      params.id,
      JSON.stringify(params.payload),
      params.title,
      params.summary,
      params.primarySignalType,
      params.confidence,
      params.stanceLabel,
      params.stanceTone,
      JSON.stringify(params.truthRefs),
    ],
  );
  return (rowCount ?? 0) > 0;
}

// ── markFailed ────────────────────────────────────────────────────────

export async function markFailed(params: MarkFailedParams): Promise<boolean> {
  const { rowCount } = await params.db.query(
    `UPDATE analysis_smart_digest
     SET status = 'failed',
         error_code = $2,
         error_message = $3,
         error_stack = $4
     WHERE id = $1 AND status IN ('pending', 'generating')`,
    [params.id, params.errorCode, params.errorMessage, params.errorStack],
  );
  return (rowCount ?? 0) > 0;
}

// ── selectByDigestId ──────────────────────────────────────────────────

export async function selectByDigestId(
  db: Pool,
  digestId: string,
): Promise<SmartDigestRow | null> {
  const { rows } = await db.query<SmartDigestRow>(
    `SELECT * FROM analysis_smart_digest WHERE digest_id = $1`,
    [digestId],
  );
  return rows[0] ?? null;
}

// ── listRecent ────────────────────────────────────────────────────────

export async function listRecent(
  db: Pool,
  opts: { symbol?: string; limit?: number } = {},
): Promise<SmartDigestRow[]> {
  const limit = opts.limit ?? 20;
  if (opts.symbol) {
    const { rows } = await db.query<SmartDigestRow>(
      `SELECT * FROM analysis_smart_digest
       WHERE symbol = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [opts.symbol, limit],
    );
    return rows;
  }
  const { rows } = await db.query<SmartDigestRow>(
    `SELECT * FROM analysis_smart_digest
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
