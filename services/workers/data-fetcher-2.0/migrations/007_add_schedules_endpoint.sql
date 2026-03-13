-- Migration: Add schedules_endpoint to worker_registry for schedule discovery
-- Date: 2026-03-13

BEGIN;

-- 1. Add schedules_endpoint column
ALTER TABLE worker_registry
ADD COLUMN IF NOT EXISTS schedules_endpoint TEXT;

-- 2. Populate for existing workers
UPDATE worker_registry
SET schedules_endpoint = 'http://data-fetcher-2.0:8080/api/data-fetcher-2.0/api/schedules'
WHERE name = 'data-fetcher-2.0';

UPDATE worker_registry
SET schedules_endpoint = 'http://fred-worker:8080/schedules'
WHERE name = 'fred-worker';

-- 3. If fred-worker doesn't exist in registry yet, insert it
INSERT INTO worker_registry (name, display_name, description, service_type, health_endpoint, schedules_endpoint, is_active)
SELECT 'fred-worker', 'FRED Worker', 'Economic indicators from Federal Reserve (FRED API)', 'data-fetcher', 'http://fred-worker:8080/health/ready', 'http://fred-worker:8080/schedules', true
WHERE NOT EXISTS (SELECT 1 FROM worker_registry WHERE name = 'fred-worker');

COMMIT;
