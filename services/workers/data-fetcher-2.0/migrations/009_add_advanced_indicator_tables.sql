-- Migration 009: Create advanced indicator tables for pro-tier features
-- These are separate from the basic indicator tables (analysis_stock_indicator / analysis_crypto_indicator)
-- to support tier-based access control at the data level.

CREATE TABLE IF NOT EXISTS analysis_stock_indicator_advanced (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_ticker_id     integer NOT NULL REFERENCES stock_tickers(id),
    data_source_id      integer NOT NULL REFERENCES lookup_data_sources(id),
    indicator_time      timestamptz NOT NULL,

    -- Volatility
    bollinger_upper     numeric,
    bollinger_lower     numeric,
    bollinger_middle    numeric,
    bollinger_bandwidth numeric,
    atr                 numeric,

    -- Momentum
    stoch_k             numeric,
    stoch_d             numeric,

    -- Trend strength
    adx                 numeric,

    -- Volume
    obv                 bigint,

    -- Key levels (JSON objects)
    fibonacci_levels    jsonb,
    pivot_levels        jsonb,

    -- Ichimoku Cloud (9, 26, 52)
    ichimoku_tenkan     numeric,
    ichimoku_kijun      numeric,
    ichimoku_senkou_a   numeric,
    ichimoku_senkou_b   numeric,
    ichimoku_chikou     numeric,

    created_at          timestamptz DEFAULT now(),

    UNIQUE (stock_ticker_id, data_source_id, indicator_time)
);

CREATE TABLE IF NOT EXISTS analysis_crypto_indicator_advanced (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    crypto_ticker_id    integer NOT NULL REFERENCES crypto_tickers(id),
    data_source_id      integer NOT NULL REFERENCES lookup_data_sources(id),
    indicator_time      timestamptz NOT NULL,

    -- Volatility
    bollinger_upper     numeric,
    bollinger_lower     numeric,
    bollinger_middle    numeric,
    bollinger_bandwidth numeric,
    atr                 numeric,

    -- Momentum
    stoch_k             numeric,
    stoch_d             numeric,

    -- Trend strength
    adx                 numeric,

    -- Volume
    obv                 bigint,

    -- Key levels (JSON objects)
    fibonacci_levels    jsonb,
    pivot_levels        jsonb,

    -- Ichimoku Cloud (9, 26, 52)
    ichimoku_tenkan     numeric,
    ichimoku_kijun      numeric,
    ichimoku_senkou_a   numeric,
    ichimoku_senkou_b   numeric,
    ichimoku_chikou     numeric,

    created_at          timestamptz DEFAULT now(),

    UNIQUE (crypto_ticker_id, data_source_id, indicator_time)
);
