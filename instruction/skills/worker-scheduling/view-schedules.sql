-- ===========================================
-- View Current Worker Schedules
-- ===========================================
-- Run this in Supabase SQL Editor to see current schedules
-- ===========================================

-- View all schedules with data source info
SELECT 
    fs.name AS schedule_name,
    fs.schedule_time,
    fs.schedule_timezone,
    fs.is_enabled,
    fs.last_run_at,
    fs.last_run_status,
    fs.last_run_message,
    ds.name AS data_source
FROM fetch_schedules fs
JOIN data_sources ds ON fs.data_source_id = ds.id
ORDER BY fs.name;


-- ===========================================
-- Example: Update TwelveData Schedule
-- ===========================================
-- UPDATE fetch_schedules 
-- SET schedule_time = '16:30:00',
--     schedule_timezone = 'America/New_York',
--     updated_at = CURRENT_TIMESTAMP
-- WHERE name = 'TwelveData Daily Stocks';


-- ===========================================
-- Example: Update CandlestickAnalysis Schedule  
-- ===========================================
-- UPDATE fetch_schedules 
-- SET schedule_time = '18:30:00',
--     schedule_timezone = 'America/New_York',
--     updated_at = CURRENT_TIMESTAMP
-- WHERE name = 'Daily Candlestick Analysis';


-- ===========================================
-- Example: Disable a schedule
-- ===========================================
-- UPDATE fetch_schedules 
-- SET is_enabled = false,
--     updated_at = CURRENT_TIMESTAMP
-- WHERE name = 'Daily Candlestick Analysis';
