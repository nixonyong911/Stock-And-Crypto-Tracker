BEGIN;

ALTER TABLE insider_trading_transactions
  RENAME TO analysis_insider_trading_transactions;

ALTER INDEX idx_insider_txn_symbol RENAME TO idx_analysis_insider_txn_symbol;
ALTER INDEX idx_insider_txn_date RENAME TO idx_analysis_insider_txn_date;
ALTER INDEX idx_insider_txn_ticker RENAME TO idx_analysis_insider_txn_ticker;

COMMIT;
