-- Slice 5: track tickers removed from affected_tickers at INSERT time.
--
-- tickers_inferred : tickers the LLM proposed in affected_tickers that had
--                    no support in the contributing-stories ticker union AND
--                    were on the broad-index boilerplate allowlist. Dropped
--                    from affected_tickers at INSERT for inspectability and
--                    to enable downstream discounting.

BEGIN;

ALTER TABLE analysis_market_memory
    ADD COLUMN IF NOT EXISTS tickers_inferred TEXT[] DEFAULT '{}';

COMMENT ON COLUMN analysis_market_memory.tickers_inferred IS
'Slice 5: broad-index boilerplate tickers dropped from affected_tickers at INSERT because no contributing story evidenced them. Stored for inspectability.';

COMMIT;
