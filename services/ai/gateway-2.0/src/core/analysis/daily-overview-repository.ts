import type { Pool } from "pg";

// ── Types ─────────────────────────────────────────────────────────────

export type DailyOverviewStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed"
  | "invalidated"
  | "superseded";

export interface DailyOverviewRow {
  id: number;
  overview_id: string;
  overview_date: string;
  session_type: string;
  locale: string;
  trigger_reason: string;
  snapshot_refs: Record<string, unknown>;
  snapshot_hash: string;
  context_hash: string;
  payload: Record<string, unknown>;
  narrative: string | null;
  top_stories: string[] | null;
  message_format: string;
  synthesis_source: string;
  schema_version: number;
  generator_version: string;
  prompt_version: string;
  model_name: string;
  code_version: string;
  status: DailyOverviewStatus;
  attempt_number: number;
  requested_at: string;
  generation_started_at: string | null;
  generated_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  llm_duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  error_stack: string | null;
}

export interface GetCurrentOverviewParams {
  db: Pool;
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

export interface AcquireOverviewSlotParams {
  db: Pool;
  overviewDate: string;
  sessionType: string;
  locale: string;
  triggerReason: string;
  snapshotRefs: Record<string, unknown>;
  snapshotHash: string;
  contextHash: string;
  schemaVersion: number;
  generatorVersion: string;
  promptVersion: string;
  modelName: string;
  codeVersion: string;
  attemptNumber?: number;
}

export interface MarkOverviewReadyParams {
  db: Pool;
  id: number;
  synthesisSource: "llm" | "template_fallback";
  payload: Record<string, unknown>;
  narrative: string | null;
  topStories: string[] | null;
  llmDurationMs: number | null;
}

export interface MarkOverviewFailedParams {
  db: Pool;
  id: number;
  errorCode: string;
  errorMessage: string;
  errorStack: string;
}

// ── getCurrentOverviewArtifact ────────────────────────────────────────

const CURRENT_OVERVIEW_WHERE = `
     WHERE overview_date = $1
       AND session_type  = $2
       AND locale        = $3
       AND status        = 'ready'
       AND snapshot_hash = $4
       AND context_hash  = $5
       AND schema_version    = $6
       AND generator_version = $7
       AND prompt_version IS NOT DISTINCT FROM $8
       AND model_name    = $9`;

export async function getCurrentOverviewArtifact(
  params: GetCurrentOverviewParams,
): Promise<DailyOverviewRow | null> {
  const { rows } = await params.db.query<DailyOverviewRow>(
    `SELECT *
     FROM analysis_daily_overview${CURRENT_OVERVIEW_WHERE}
     ORDER BY generated_at DESC
     LIMIT 1`,
    [
      params.overviewDate,
      params.sessionType,
      params.locale,
      params.snapshotHash,
      params.contextHash,
      params.schemaVersion,
      params.generatorVersion,
      params.promptVersion,
      params.modelName,
    ],
  );
  return rows[0] ?? null;
}

// ── findCurrentOverviewCandidates ─────────────────────────────────────

export async function findCurrentOverviewCandidates(
  params: GetCurrentOverviewParams & { candidateLimit?: number },
): Promise<DailyOverviewRow[]> {
  const { rows } = await params.db.query<DailyOverviewRow>(
    `SELECT *
     FROM analysis_daily_overview${CURRENT_OVERVIEW_WHERE}
     ORDER BY generated_at DESC
     LIMIT $10`,
    [
      params.overviewDate,
      params.sessionType,
      params.locale,
      params.snapshotHash,
      params.contextHash,
      params.schemaVersion,
      params.generatorVersion,
      params.promptVersion,
      params.modelName,
      params.candidateLimit ?? 5,
    ],
  );
  return rows;
}

// ── findOverviewSlotPeers ─────────────────────────────────────────────

export async function findOverviewSlotPeers(
  db: Pool,
  opts: { overviewDate: string; sessionType: string; locale: string; limit?: number },
): Promise<DailyOverviewRow[]> {
  const { rows } = await db.query<DailyOverviewRow>(
    `SELECT *
     FROM analysis_daily_overview
     WHERE overview_date = $1
       AND session_type = $2
       AND locale = $3
       AND status = 'ready'
     ORDER BY generated_at DESC
     LIMIT $4`,
    [opts.overviewDate, opts.sessionType, opts.locale, opts.limit ?? 3],
  );
  return rows;
}

// ── acquireOverviewSlot ───────────────────────────────────────────────

export async function acquireOverviewSlot(
  params: AcquireOverviewSlotParams,
): Promise<{ id: number; overview_id: string } | null> {
  try {
    const { rows } = await params.db.query<{
      id: number;
      overview_id: string;
    }>(
      `INSERT INTO analysis_daily_overview
       (overview_date, session_type, locale, trigger_reason,
        snapshot_refs, snapshot_hash, context_hash,
        schema_version, generator_version, prompt_version, model_name,
        code_version, attempt_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
       RETURNING id, overview_id`,
      [
        params.overviewDate,
        params.sessionType,
        params.locale,
        params.triggerReason,
        JSON.stringify(params.snapshotRefs),
        params.snapshotHash,
        params.contextHash,
        params.schemaVersion,
        params.generatorVersion,
        params.promptVersion,
        params.modelName,
        params.codeVersion,
        params.attemptNumber ?? 1,
      ],
    );
    return rows[0] ?? null;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes("uq_dov_inflight")
    ) {
      return null;
    }
    throw err;
  }
}

// ── markOverviewGenerating ────────────────────────────────────────────

export async function markOverviewGenerating(
  db: Pool,
  id: number,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE analysis_daily_overview
     SET status = 'generating', generation_started_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ── markOverviewReady ─────────────────────────────────────────────────

export async function markOverviewReady(
  params: MarkOverviewReadyParams,
): Promise<boolean> {
  const { rowCount } = await params.db.query(
    `UPDATE analysis_daily_overview
     SET status           = 'ready',
         generated_at     = NOW(),
         synthesis_source = $2,
         payload          = $3,
         narrative        = $4,
         top_stories      = $5,
         llm_duration_ms  = $6
     WHERE id = $1 AND status IN ('pending', 'generating')`,
    [
      params.id,
      params.synthesisSource,
      JSON.stringify(params.payload),
      params.narrative,
      params.topStories ? JSON.stringify(params.topStories) : null,
      params.llmDurationMs,
    ],
  );
  return (rowCount ?? 0) > 0;
}

// ── markOverviewFailed ────────────────────────────────────────────────

export async function markOverviewFailed(
  params: MarkOverviewFailedParams,
): Promise<boolean> {
  const { rowCount } = await params.db.query(
    `UPDATE analysis_daily_overview
     SET status        = 'failed',
         error_code    = $2,
         error_message = $3,
         error_stack   = $4
     WHERE id = $1 AND status IN ('pending', 'generating')`,
    [params.id, params.errorCode, params.errorMessage, params.errorStack],
  );
  return (rowCount ?? 0) > 0;
}

// ── selectByOverviewId ────────────────────────────────────────────────

export async function selectByOverviewId(
  db: Pool,
  overviewId: string,
): Promise<DailyOverviewRow | null> {
  const { rows } = await db.query<DailyOverviewRow>(
    `SELECT * FROM analysis_daily_overview WHERE overview_id = $1`,
    [overviewId],
  );
  return rows[0] ?? null;
}

// ── selectOverviewById ───────────────────────────────────────────────

export async function selectOverviewById(
  db: Pool,
  id: number,
): Promise<DailyOverviewRow | null> {
  const { rows } = await db.query<DailyOverviewRow>(
    `SELECT * FROM analysis_daily_overview WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ── markOverviewInvalidated ──────────────────────────────────────────

export async function markOverviewInvalidated(params: {
  db: Pool;
  id: number;
  reason: string;
}): Promise<DailyOverviewRow | null> {
  const { rows } = await params.db.query<DailyOverviewRow>(
    `UPDATE analysis_daily_overview
       SET status = 'invalidated',
           invalidated_at = NOW(),
           error_message = $2
     WHERE id = $1 AND status = 'ready'
     RETURNING *`,
    [params.id, params.reason],
  );
  return rows[0] ?? null;
}

// ── listInflightOverviews ────────────────────────────────────────────

export async function listInflightOverviews(
  db: Pool,
  opts: { olderThanMs?: number; limit?: number } = {},
): Promise<DailyOverviewRow[]> {
  const olderThanSec = Math.floor((opts.olderThanMs ?? 0) / 1000);
  const { rows } = await db.query<DailyOverviewRow>(
    `SELECT * FROM analysis_daily_overview
     WHERE status IN ('pending','generating')
       AND requested_at < NOW() - ($1 || ' seconds')::interval
     ORDER BY requested_at ASC
     LIMIT $2`,
    [String(olderThanSec), opts.limit ?? 100],
  );
  return rows;
}

// ── listRecentOverviews ───────────────────────────────────────────────

const OVERVIEW_SUMMARY_COLUMNS = `id, overview_id, overview_date, session_type,
  locale, trigger_reason, snapshot_hash, context_hash, schema_version,
  generator_version, prompt_version, model_name, code_version, status,
  synthesis_source, attempt_number, requested_at, generation_started_at,
  generated_at, invalidated_at, created_at, llm_duration_ms,
  narrative, top_stories, message_format,
  error_code, error_message`;

export async function listRecentOverviews(
  db: Pool,
  opts: { sessionType?: string; status?: DailyOverviewStatus; summary?: boolean; limit?: number } = {},
): Promise<DailyOverviewRow[]> {
  const limit = opts.limit ?? 20;
  const cols = opts.summary ? OVERVIEW_SUMMARY_COLUMNS : "*";
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.sessionType) {
    conditions.push(`session_type = $${idx++}`);
    params.push(opts.sessionType);
  }
  if (opts.status) {
    conditions.push(`status = $${idx++}`);
    params.push(opts.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);

  const { rows } = await db.query<DailyOverviewRow>(
    `SELECT ${cols} FROM analysis_daily_overview
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    params,
  );
  return rows;
}
