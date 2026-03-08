-- Migration: 014_user_price_alerts
-- Per-user price alerts. Fires when a fetched bar's [low, high] crosses the target_price.

CREATE TABLE IF NOT EXISTS user_price_alerts (
    id            bigserial      PRIMARY KEY,
    clerk_user_id text           NOT NULL,
    asset_type    varchar(10)    NOT NULL CHECK (asset_type IN ('stock', 'etf', 'crypto')),
    ticker_symbol varchar(20)    NOT NULL,
    target_price  decimal(18,6)  NOT NULL,
    status        varchar(20)    NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'triggered')),
    created_at    timestamptz    NOT NULL DEFAULT NOW(),
    triggered_at  timestamptz,
    UNIQUE (clerk_user_id, ticker_symbol, target_price)
);

CREATE INDEX IF NOT EXISTS idx_user_price_alerts_active ON user_price_alerts (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_user   ON user_price_alerts (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_price_alerts_symbol ON user_price_alerts (ticker_symbol);
