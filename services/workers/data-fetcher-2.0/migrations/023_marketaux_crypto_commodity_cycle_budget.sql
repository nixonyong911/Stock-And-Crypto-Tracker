-- Bump MarketAux per-cycle request budget for commodity search + cryptocurrency entity pass.
-- Each HTTP page = 1 request; service uses up to 6 pages × 4 focused categories + 4 crypto + market remainder.

BEGIN;

UPDATE worker_fetch_schedules
SET fetch_config = jsonb_set(
        COALESCE(fetch_config, '{}'::jsonb),
        '{cycle_budget}',
        '35'::jsonb,
        true
    ),
    updated_at = NOW()
WHERE name = 'MarketAux News Fetch';

COMMIT;
