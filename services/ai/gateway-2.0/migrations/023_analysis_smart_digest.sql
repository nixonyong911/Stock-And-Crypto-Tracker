-- 023_analysis_smart_digest.sql
--
-- Canonical per-ticker Smart Digest artifact table.
-- Each row is an immutable generation attempt; lifecycle is managed via
-- status transitions only. Reuse eligibility is gated by content-meaning
-- fields (truth_hash, context_hash, schema_version, generator_version,
-- prompt_version, freshness) — never by deploy SHA (code_version is
-- audit-only).

BEGIN;

CREATE TABLE IF NOT EXISTS analysis_smart_digest (
  id                     BIGSERIAL PRIMARY KEY,
  digest_id              UUID NOT NULL DEFAULT gen_random_uuid(),

  symbol                 VARCHAR(20) NOT NULL,
  asset_type             VARCHAR(10) NOT NULL,
  digest_date            DATE NOT NULL,
  mode                   VARCHAR(20) NOT NULL,
  window_start           TIMESTAMPTZ NOT NULL,
  window_end             TIMESTAMPTZ NOT NULL,
  trigger_reason         VARCHAR(40) NOT NULL,
  brief_mode             VARCHAR(10) NOT NULL DEFAULT 'strict',

  payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  title                  TEXT,
  summary                TEXT,
  primary_signal_type    VARCHAR(30),
  confidence             VARCHAR(10),
  stance_label           VARCHAR(20),
  stance_tone            VARCHAR(20),

  truth_refs             JSONB NOT NULL DEFAULT '{}'::jsonb,
  truth_hash             TEXT NOT NULL,
  context_hash           TEXT NOT NULL,
  schema_version         INT  NOT NULL,
  generator_version      TEXT NOT NULL,
  prompt_version         TEXT,
  code_version           TEXT NOT NULL,
  model_name             TEXT,

  status                 VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_number         INT NOT NULL DEFAULT 1,

  requested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generation_started_at  TIMESTAMPTZ,
  generated_at           TIMESTAMPTZ,
  invalidated_at         TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  error_code             TEXT,
  error_message          TEXT,
  error_stack            TEXT,

  CONSTRAINT chk_smart_digest_status     CHECK (status IN ('pending','generating','ready','failed','invalidated','superseded')),
  CONSTRAINT chk_smart_digest_mode       CHECK (mode IN ('pre_open','post_close','intraday','on_demand')),
  CONSTRAINT chk_smart_digest_asset_type CHECK (asset_type IN ('stock','crypto','etf')),
  CONSTRAINT chk_smart_digest_brief_mode CHECK (brief_mode IN ('strict','blended')),
  CONSTRAINT chk_smart_digest_attempt    CHECK (attempt_number BETWEEN 1 AND 3),
  CONSTRAINT uq_smart_digest_digest_id   UNIQUE (digest_id)
);

CREATE INDEX idx_smart_digest_current
  ON analysis_smart_digest (symbol, asset_type, brief_mode, status, generated_at DESC);

CREATE INDEX idx_smart_digest_digest_date
  ON analysis_smart_digest (digest_date DESC, symbol);

CREATE INDEX idx_smart_digest_slot_window
  ON analysis_smart_digest (symbol, asset_type, mode, window_start);

CREATE INDEX idx_smart_digest_status_requested
  ON analysis_smart_digest (status, requested_at)
  WHERE status IN ('pending','generating');

CREATE UNIQUE INDEX uq_smart_digest_inflight
  ON analysis_smart_digest (symbol, asset_type, mode, window_start, brief_mode)
  WHERE status IN ('pending','generating');

COMMIT;
