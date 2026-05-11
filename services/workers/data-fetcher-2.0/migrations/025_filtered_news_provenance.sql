BEGIN;

ALTER TABLE analysis_filtered_news
    ADD COLUMN IF NOT EXISTS model_name TEXT,
    ADD COLUMN IF NOT EXISTS prompt_version TEXT,
    ADD COLUMN IF NOT EXISTS validator_version TEXT,
    ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS tickers_unknown TEXT[] DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_filtered_news_prompt_version
    ON analysis_filtered_news (prompt_version);

COMMIT;
