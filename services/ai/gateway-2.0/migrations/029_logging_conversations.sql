-- ============================================================================
-- logging_conversations: append-only, one row per message (inbound/outbound).
-- A shared trace_id ties one inbound row to one or more outbound rows.
-- channel is a plain string so future channels need no schema change.
-- ============================================================================
CREATE TABLE IF NOT EXISTS logging_conversations (
  id               BIGSERIAL PRIMARY KEY,
  trace_id         UUID NOT NULL,
  direction        VARCHAR(16)  NOT NULL,   -- 'inbound' | 'outbound'
  channel          VARCHAR(50)  NOT NULL,   -- dynamic string, not telegram-specific
  external_user_id VARCHAR(255) NOT NULL,   -- external user this turn belongs to (author inbound / recipient outbound)
  clerk_user_id    VARCHAR(255),            -- resolved identity, nullable
  session_id       VARCHAR(255),            -- cli session id
  message_text     TEXT NOT NULL,           -- inbound: sent to agent; outbound: generated reply prepared for send (not confirmed delivery)
  metadata         JSONB,                   -- optional channel-specific extras
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_logging_conv_direction CHECK (direction IN ('inbound', 'outbound'))
);

CREATE INDEX IF NOT EXISTS idx_logging_conv_created ON logging_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_logging_conv_user    ON logging_conversations(external_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logging_conv_trace   ON logging_conversations(trace_id);
