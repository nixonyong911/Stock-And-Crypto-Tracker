-- Migration: Add worker execution log table for execution history tracking
-- Date: 2026-03-11

BEGIN;

-- 1. Create worker_execution_log table
CREATE TABLE IF NOT EXISTS worker_execution_log (
    id BIGSERIAL PRIMARY KEY,
    schedule_id INT NOT NULL REFERENCES worker_fetch_schedules(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    message TEXT,
    duration_ms INT,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exec_log_schedule_completed
    ON worker_execution_log(schedule_id, completed_at DESC);

-- 2. Fix MarketAux News Fetch schedule: set worker_id and description
UPDATE worker_fetch_schedules
SET worker_id = (SELECT id FROM worker_registry WHERE name = 'data-fetcher-2.0'),
    description = 'Fetches market-moving news (Fed, geopolitical, policy, indices) from MarketAux API with built-in sentiment scoring. Runs every 2 hours, 4 queries per cycle.'
WHERE name = 'MarketAux News Fetch' AND worker_id IS NULL;

COMMIT;
