-- Slice 10 revert generated at 2026-05-12T08:00:47.851Z, run_id 28316799-3cec-4016-8311-72ecb8b90f4f
BEGIN;
UPDATE analysis_market_memory
SET affected_tickers       = ARRAY['GME','EBAY','SPX500']::text[],
    tickers_inferred       = ARRAY[]::text[],
    primary_ticker         = NULL,
    primary_ticker_source  = NULL
WHERE theme_id = '1690bd7f-3477-4c32-a4b0-7025ca10ea76' AND id = 285;
UPDATE analysis_market_memory
SET affected_tickers       = ARRAY['DAX','STOXX50','GM','F','TSLA','SPX500','GOLD']::text[],
    tickers_inferred       = ARRAY[]::text[],
    primary_ticker         = NULL,
    primary_ticker_source  = NULL
WHERE theme_id = 'd08faa3c-df68-4706-a1ad-bab6dff9d7ac' AND id = 263;
UPDATE analysis_market_memory
SET affected_tickers       = ARRAY['AZN','JNJ','ROIV','WELL','GH','BLLN','ARGX','RDNT','SPX500']::text[],
    tickers_inferred       = ARRAY[]::text[],
    primary_ticker         = NULL,
    primary_ticker_source  = NULL
WHERE theme_id = '1975350f-0a43-4cca-819a-0f524cb1a137' AND id = 287;
UPDATE analysis_market_memory
SET affected_tickers       = ARRAY['BTC','ETH','COIN','PANW','CRWD']::text[],
    tickers_inferred       = ARRAY[]::text[],
    primary_ticker         = NULL,
    primary_ticker_source  = NULL
WHERE theme_id = 'c6021149-75ca-4288-8377-5c89abb17277' AND id = 257;
UPDATE analysis_market_memory
SET affected_tickers       = ARRAY['DAX','OIL','NATGAS','SPX500']::text[],
    tickers_inferred       = ARRAY[]::text[],
    primary_ticker         = NULL,
    primary_ticker_source  = NULL
WHERE theme_id = '4d870c73-a68f-406a-b5d7-513d8d036f5d' AND id = 207;
UPDATE analysis_market_memory
SET affected_tickers       = ARRAY['CL=F','BNO','XLE','USO','SPY','QQQ','DIA','TLT','GLD','LMT','RTX','XOM','CVX','COP']::text[],
    tickers_inferred       = ARRAY[]::text[],
    primary_ticker         = NULL,
    primary_ticker_source  = NULL
WHERE theme_id = 'd72c6b36-dd4e-4fad-b2f6-28202b35ca7e' AND id = 1;
COMMIT;
