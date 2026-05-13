-- 024_analysis_daily_overview.sql
--
-- Canonical per-session daily overview artifact table.
-- Each row is an immutable generation attempt; lifecycle is managed via
-- status transitions only. Reuse eligibility is gated by content-meaning
-- fields (snapshot_hash, context_hash, schema_version, generator_version,
-- prompt_version, model_name, within the same (overview_date, session_type,
-- locale) slot) — never by deploy SHA (code_version is audit-only).

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_daily_overview (
  id                     BIGSERIAL PRIMARY KEY,
  overview_id            UUID NOT NULL DEFAULT gen_random_uuid(),

  overview_date          DATE NOT NULL,
  session_type           VARCHAR(20) NOT NULL,
  locale                 VARCHAR(10) NOT NULL DEFAULT 'en',
  trigger_reason         VARCHAR(40) NOT NULL,

  snapshot_refs          JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash          TEXT NOT NULL,
  context_hash           TEXT NOT NULL,

  payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative              TEXT,
  top_stories            JSONB,
  message_body           TEXT,
  message_format         VARCHAR(20) NOT NULL DEFAULT 'markdown',
  synthesis_source       VARCHAR(20) NOT NULL DEFAULT 'llm',

  schema_version         INT  NOT NULL,
  generator_version      TEXT NOT NULL,
  prompt_version         TEXT NOT NULL DEFAULT 'overview.v1',
  model_name             TEXT NOT NULL,
  code_version           TEXT NOT NULL,

  status                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_number         INT NOT NULL DEFAULT 1,

  requested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generation_started_at  TIMESTAMPTZ,
  generated_at           TIMESTAMPTZ,
  invalidated_at         TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  llm_duration_ms        INT,

  error_code             TEXT,
  error_message          TEXT,
  error_stack            TEXT,

  CONSTRAINT chk_dov_status   CHECK (status IN ('pending','generating','ready','failed','invalidated','superseded')),
  CONSTRAINT chk_dov_session  CHECK (session_type IN ('pre_market','post_close')),
  CONSTRAINT chk_dov_format   CHECK (message_format IN ('markdown','plain','html')),
  CONSTRAINT chk_dov_source   CHECK (synthesis_source IN ('llm','template_fallback')),
  CONSTRAINT chk_dov_attempt  CHECK (attempt_number BETWEEN 1 AND 5),
  CONSTRAINT uq_dov_overview_id UNIQUE (overview_id)
);

CREATE INDEX idx_dov_current
  ON analysis_daily_overview (overview_date DESC, session_type, locale, status, generated_at DESC);

CREATE INDEX idx_dov_status_requested
  ON analysis_daily_overview (status, requested_at)
  WHERE status IN ('pending','generating');

CREATE UNIQUE INDEX uq_dov_inflight
  ON analysis_daily_overview (overview_date, session_type, locale)
  WHERE status IN ('pending','generating');

COMMIT;
