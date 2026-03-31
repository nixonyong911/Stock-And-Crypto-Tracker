-- Migration 022: eToro Discovery Leaderboard
-- Materialized view that scores and ranks all eToro instruments across 5 dimensions:
-- crowd adoption, buying momentum, smart money conviction, trend acceleration, curated recognition.
-- Refreshed every 4h by EtoroSocialDataWorker after data insertion.

BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS analysis_leaderboard_etoro AS
WITH latest_fetch AS (
    SELECT MAX(fetched_at) AS ts FROM unfiltered_etoro_social_instrument_data
),
prev_fetch AS (
    SELECT MAX(fetched_at) AS ts
    FROM unfiltered_etoro_social_instrument_data
    WHERE fetched_at < (SELECT ts FROM latest_fetch)
),
latest_social AS (
    SELECT * FROM unfiltered_etoro_social_instrument_data
    WHERE fetched_at = (SELECT ts FROM latest_fetch)
),
prev_social AS (
    SELECT instrument_id, holding_pct
    FROM unfiltered_etoro_social_instrument_data
    WHERE fetched_at = (SELECT ts FROM prev_fetch)
),
investors AS (
    SELECT
        instrument_id,
        COUNT(DISTINCT username) AS investor_count,
        COUNT(DISTINCT username) FILTER (WHERE is_buy) AS bullish_count,
        AVG(total_investment_pct) AS avg_allocation,
        AVG(avg_net_profit) AS avg_profit
    FROM unfiltered_etoro_top_investor_positions
    WHERE fetched_at = (SELECT MAX(fetched_at) FROM unfiltered_etoro_top_investor_positions)
    GROUP BY instrument_id
),
curated AS (
    SELECT
        instrument_id,
        COUNT(DISTINCT list_name) AS list_count,
        string_agg(DISTINCT list_name, ', ' ORDER BY list_name) AS list_names
    FROM unfiltered_etoro_curated_lists
    WHERE fetched_at = (SELECT MAX(fetched_at) FROM unfiltered_etoro_curated_lists)
    GROUP BY instrument_id
),
all_instruments AS (
    SELECT instrument_id FROM latest_social
    UNION
    SELECT instrument_id FROM investors
    UNION
    SELECT instrument_id FROM curated
),
combined AS (
    SELECT
        a.instrument_id,
        l.symbol,
        l.display_name,
        l.instrument_type_id,
        s.holding_pct,
        s.buy_holding_pct,
        s.sell_holding_pct,
        s.buy_pct_change_24h,
        s.traders_7day_change,
        s.traders_30day_change,
        s.popularity_uniques_7day,
        s.daily_price_change,
        s.weekly_price_change,
        s.monthly_price_change,
        s.current_rate,
        COALESCE(s.holding_pct, 0) - COALESCE(ps.holding_pct, 0) AS holding_pct_delta,
        COALESCE(inv.investor_count, 0) AS top_investor_count,
        COALESCE(inv.bullish_count, 0) AS bullish_investor_count,
        inv.avg_allocation AS top_investor_avg_allocation,
        inv.avg_profit AS top_investor_avg_profit,
        COALESCE(cu.list_count, 0) AS curated_list_count,
        cu.list_names AS curated_lists,
        (SELECT ts FROM latest_fetch) AS snapshot_at
    FROM all_instruments a
    JOIN lookup_etoro_instruments l ON l.instrument_id = a.instrument_id
    LEFT JOIN latest_social s ON s.instrument_id = a.instrument_id
    LEFT JOIN prev_social ps ON ps.instrument_id = a.instrument_id
    LEFT JOIN investors inv ON inv.instrument_id = a.instrument_id
    LEFT JOIN curated cu ON cu.instrument_id = a.instrument_id
),
scored AS (
    SELECT
        *,
        ROUND((COALESCE(PERCENT_RANK() OVER (ORDER BY holding_pct NULLS FIRST), 0) * 25)::numeric, 2)
            AS crowd_score,
        ROUND((
            COALESCE(PERCENT_RANK() OVER (ORDER BY buy_pct_change_24h NULLS FIRST), 0) * 10
            + COALESCE(PERCENT_RANK() OVER (ORDER BY traders_7day_change NULLS FIRST), 0) * 8
            + COALESCE(PERCENT_RANK() OVER (ORDER BY traders_30day_change NULLS FIRST), 0) * 7
        )::numeric, 2)
            AS momentum_score,
        ROUND((
            COALESCE(PERCENT_RANK() OVER (ORDER BY top_investor_count), 0) * 12
            + CASE
                WHEN top_investor_count > 0
                THEN (bullish_investor_count::decimal / top_investor_count) * 8
                ELSE 0
              END
            + COALESCE(PERCENT_RANK() OVER (ORDER BY top_investor_avg_profit NULLS FIRST), 0) * 5
        )::numeric, 2)
            AS smart_money_score,
        ROUND((
            COALESCE(PERCENT_RANK() OVER (ORDER BY holding_pct_delta NULLS FIRST), 0) * 10
            + COALESCE(PERCENT_RANK() OVER (ORDER BY popularity_uniques_7day NULLS FIRST), 0) * 5
        )::numeric, 2)
            AS trend_score,
        LEAST(COALESCE(curated_list_count, 0) * 5, 10)::numeric
            AS curated_score
    FROM combined
)
SELECT
    *,
    ROUND((crowd_score + momentum_score + smart_money_score + trend_score + curated_score)::numeric, 2)
        AS total_score,
    RANK() OVER (
        ORDER BY (crowd_score + momentum_score + smart_money_score + trend_score + curated_score) DESC
    ) AS rank,
    NOW() AS scored_at
FROM scored
ORDER BY total_score DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_etoro_instrument
    ON analysis_leaderboard_etoro (instrument_id);

CREATE INDEX IF NOT EXISTS idx_leaderboard_etoro_score
    ON analysis_leaderboard_etoro (total_score DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_etoro_type
    ON analysis_leaderboard_etoro (instrument_type_id);

COMMIT;
