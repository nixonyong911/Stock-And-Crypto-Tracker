-- Smart Digest: user preferences and recommendation log

CREATE TABLE IF NOT EXISTS user_digest_preferences (
    id            bigserial   PRIMARY KEY,
    clerk_user_id text        NOT NULL UNIQUE,
    is_enabled    boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT NOW(),
    updated_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_recommendation_log (
    id                  bigserial    PRIMARY KEY,
    clerk_user_id       text         NOT NULL,
    ticker_symbol       varchar(20)  NOT NULL,
    recommendation_type varchar(30)  NOT NULL,
    priority            varchar(10)  NOT NULL,
    headline            text         NOT NULL,
    message_body        text,
    timeframe_alignment varchar(20),
    sent_at             timestamptz  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_log_user_sent ON user_recommendation_log (clerk_user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_log_user_ticker ON user_recommendation_log (clerk_user_id, ticker_symbol, recommendation_type, sent_at DESC);
