BEGIN;

-- ============================================================
-- Phase 1a: Raw Finnhub insider trading transactions (tracked tickers)
-- ============================================================

CREATE TABLE IF NOT EXISTS insider_trading_transactions (
    id              BIGSERIAL PRIMARY KEY,
    stock_ticker_id INTEGER REFERENCES stock_tickers(id),
    symbol          VARCHAR(20) NOT NULL,
    finnhub_id      VARCHAR(255) UNIQUE,
    insider_name    TEXT NOT NULL,
    transaction_code VARCHAR(5) NOT NULL,
    shares_changed  DECIMAL NOT NULL,
    shares_after    BIGINT,
    transaction_price DECIMAL,
    transaction_date DATE NOT NULL,
    filing_date     DATE,
    is_derivative   BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insider_txn_symbol ON insider_trading_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_insider_txn_date ON insider_trading_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_insider_txn_ticker ON insider_trading_transactions(stock_ticker_id);

-- ============================================================
-- Phase 1b: SEC EDGAR Form 4 insider trading (market-wide)
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_insider_trading (
    id                  BIGSERIAL PRIMARY KEY,
    accession_number    VARCHAR(25) NOT NULL,
    issuer_cik          VARCHAR(20) NOT NULL,
    issuer_name         TEXT,
    issuer_symbol       VARCHAR(20),
    insider_cik         VARCHAR(20),
    insider_name        TEXT NOT NULL,
    is_director         BOOLEAN DEFAULT FALSE,
    is_officer          BOOLEAN DEFAULT FALSE,
    is_ten_pct_owner    BOOLEAN DEFAULT FALSE,
    officer_title       TEXT,
    transaction_code    VARCHAR(5),
    shares_amount       DECIMAL,
    price_per_share     DECIMAL,
    acquired_or_disposed VARCHAR(1),
    shares_after        DECIMAL,
    transaction_date    DATE,
    filing_date         DATE NOT NULL,
    is_derivative       BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(accession_number, insider_cik, transaction_date, transaction_code, shares_amount)
);

CREATE INDEX IF NOT EXISTS idx_disc_insider_symbol ON discovery_insider_trading(issuer_symbol);
CREATE INDEX IF NOT EXISTS idx_disc_insider_filing ON discovery_insider_trading(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_disc_insider_name ON discovery_insider_trading(insider_name);
CREATE INDEX IF NOT EXISTS idx_disc_insider_code ON discovery_insider_trading(transaction_code);

-- ============================================================
-- Phase 2: Institutional holdings (13F filings)
-- ============================================================

CREATE TABLE IF NOT EXISTS discovery_institutional_holdings (
    id              BIGSERIAL PRIMARY KEY,
    filer_cik       VARCHAR(20) NOT NULL,
    filer_name      TEXT NOT NULL,
    period_of_report DATE NOT NULL,
    filing_date     DATE NOT NULL,
    cusip           VARCHAR(9),
    ticker          VARCHAR(20),
    company_name    TEXT,
    shares          BIGINT,
    value_usd       BIGINT,
    change_shares   BIGINT,
    change_pct      DECIMAL,
    is_new_position BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(filer_cik, period_of_report, cusip)
);

CREATE INDEX IF NOT EXISTS idx_disc_inst_ticker ON discovery_institutional_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_disc_inst_period ON discovery_institutional_holdings(period_of_report DESC);
CREATE INDEX IF NOT EXISTS idx_disc_inst_new ON discovery_institutional_holdings(is_new_position) WHERE is_new_position;

-- ============================================================
-- Phase 3: Discovery scoring (materialized view)
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS discovery_signals_scored AS
WITH insider_scores AS (
    SELECT
        issuer_symbol AS ticker,
        COUNT(*) FILTER (WHERE transaction_code IN ('P','A') AND NOT is_derivative) AS buy_count,
        COUNT(*) FILTER (WHERE is_officer AND transaction_code = 'P') AS csuite_buy_count,
        COUNT(DISTINCT insider_name) FILTER (WHERE transaction_code = 'P') AS unique_buyers,
        COALESCE(SUM(shares_amount * price_per_share) FILTER (WHERE transaction_code = 'P'), 0) AS total_buy_value
    FROM discovery_insider_trading
    WHERE filing_date >= CURRENT_DATE - 30
      AND issuer_symbol IS NOT NULL
    GROUP BY issuer_symbol
),
institutional_scores AS (
    SELECT
        ticker,
        COUNT(*) FILTER (WHERE is_new_position) AS new_position_count,
        COUNT(*) FILTER (WHERE change_pct > 10) AS accumulation_count,
        SUM(value_usd) FILTER (WHERE is_new_position) AS new_position_value
    FROM discovery_institutional_holdings
    WHERE period_of_report >= CURRENT_DATE - 120
      AND ticker IS NOT NULL
    GROUP BY ticker
)
SELECT
    COALESCE(i.ticker, inst.ticker) AS ticker,
    COALESCE(i.unique_buyers, 0)::int * 3 AS cluster_buy_score,
    COALESCE(i.csuite_buy_count, 0)::int * 5 AS csuite_score,
    CASE WHEN COALESCE(i.total_buy_value, 0) > 500000 THEN 4 ELSE 0 END AS large_buy_score,
    COALESCE(inst.new_position_count, 0)::int * 3 AS new_position_score,
    COALESCE(inst.accumulation_count, 0)::int * 2 AS accumulation_score,
    (COALESCE(i.unique_buyers, 0)::int * 3
     + COALESCE(i.csuite_buy_count, 0)::int * 5
     + CASE WHEN COALESCE(i.total_buy_value, 0) > 500000 THEN 4 ELSE 0 END
     + COALESCE(inst.new_position_count, 0)::int * 3
     + COALESCE(inst.accumulation_count, 0)::int * 2) AS total_score,
    COALESCE(i.buy_count, 0)::int AS insider_buy_count,
    COALESCE(i.total_buy_value, 0)::numeric AS insider_total_buy_value,
    COALESCE(inst.new_position_count, 0)::int AS inst_new_positions,
    COALESCE(inst.new_position_value, 0)::bigint AS inst_new_position_value,
    NOW() AS scored_at
FROM insider_scores i
FULL OUTER JOIN institutional_scores inst ON i.ticker = inst.ticker
WHERE (COALESCE(i.unique_buyers, 0)::int * 3
       + COALESCE(i.csuite_buy_count, 0)::int * 5
       + CASE WHEN COALESCE(i.total_buy_value, 0) > 500000 THEN 4 ELSE 0 END
       + COALESCE(inst.new_position_count, 0)::int * 3
       + COALESCE(inst.accumulation_count, 0)::int * 2) > 0
ORDER BY total_score DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_disc_score_ticker ON discovery_signals_scored(ticker);

COMMIT;
