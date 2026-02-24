-- Migration: 005_user_watchlist
-- Per-user ticker tracking (watchlist). Binds clerk_user_id to ticker symbols.

CREATE TABLE IF NOT EXISTS user_watchlist (
    id            bigserial    PRIMARY KEY,
    clerk_user_id text         NOT NULL,
    asset_type    varchar(10)  NOT NULL CHECK (asset_type IN ('stock', 'etf', 'crypto')),
    ticker_symbol varchar(20)  NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT NOW(),
    UNIQUE (clerk_user_id, ticker_symbol)
);

CREATE INDEX IF NOT EXISTS idx_user_watchlist_user   ON user_watchlist (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_symbol ON user_watchlist (ticker_symbol);
