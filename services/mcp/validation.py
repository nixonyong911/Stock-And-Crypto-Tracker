"""
MCP-DataFetcher shared column contract validation.
Ensures MCP SQL queries only reference columns that actually exist in the database.
"""
import logging

logger = logging.getLogger("mcp.validation")

EXPECTED_COLUMNS = {
    "analysis_indicators_stock_free": [
        "stock_ticker_id", "data_source_id", "indicator_time",
        "sma", "ema", "macd_value", "macd_signal", "macd_histogram", "rsi",
    ],
    "analysis_indicators_stock_pro": [
        "stock_ticker_id", "data_source_id", "indicator_time",
        "bollinger_upper", "bollinger_lower", "bollinger_middle", "bollinger_bandwidth",
        "atr", "stoch_k", "stoch_d", "adx", "obv",
        "fibonacci_levels", "pivot_levels",
        "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b", "ichimoku_chikou",
        "insider_buy_count", "insider_sell_count", "insider_net_shares", "insider_net_value",
        "analyst_buy", "analyst_hold", "analyst_sell", "analyst_strong_buy", "analyst_strong_sell",
    ],
    "analysis_indicators_crypto_free": [
        "crypto_ticker_id", "data_source_id", "indicator_time",
        "sma", "ema", "macd_value", "macd_signal", "macd_histogram", "rsi",
    ],
    "analysis_indicators_crypto_pro": [
        "crypto_ticker_id", "data_source_id", "indicator_time",
        "bollinger_upper", "bollinger_lower", "bollinger_middle", "bollinger_bandwidth",
        "atr", "stoch_k", "stoch_d", "adx", "obv",
        "fibonacci_levels", "pivot_levels",
        "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_senkou_a", "ichimoku_senkou_b", "ichimoku_chikou",
    ],
}


async def validate_indicator_columns(pool) -> dict:
    """
    Verify all columns referenced in EXPECTED_COLUMNS exist in the actual DB schema.
    Returns a dict with validation results per table.
    """
    results = {}
    async with pool.acquire() as conn:
        for table, expected_cols in EXPECTED_COLUMNS.items():
            try:
                actual_cols_rows = await conn.fetch(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = $1
                    ORDER BY ordinal_position
                    """,
                    table,
                )
                actual_cols = {row["column_name"] for row in actual_cols_rows}

                if not actual_cols:
                    results[table] = {
                        "status": "missing_table",
                        "error": f"Table '{table}' does not exist",
                    }
                    logger.error("Column validation: table '%s' does not exist!", table)
                    continue

                missing = set(expected_cols) - actual_cols
                extra_in_db = actual_cols - set(expected_cols) - {"id", "created_at", "updated_at"}

                if missing:
                    results[table] = {
                        "status": "missing_columns",
                        "missing": sorted(missing),
                    }
                    logger.error(
                        "Column validation: table '%s' missing columns: %s",
                        table,
                        sorted(missing),
                    )
                else:
                    results[table] = {"status": "ok", "column_count": len(actual_cols)}

                if extra_in_db:
                    logger.info(
                        "Column validation: table '%s' has extra columns not in contract: %s",
                        table,
                        sorted(extra_in_db),
                    )

            except Exception as e:
                results[table] = {"status": "error", "error": str(e)}
                logger.error("Column validation failed for '%s': %s", table, e)

    return results
