# Debug CandlestickAnalysis Stream Error

## Status: In Progress

## Problem
CandlestickAnalysis worker fails with `"Exception while reading from stream"` error when querying certain database tables.

## Current State

### What Works
- `/api/analysis/health/ready` → `Healthy`
- `/api/analysis/api/status` → Returns schedule data (queries `fetch_schedules` + `data_sources`)
- TwelveData worker works perfectly with same database

### What Fails
- `/api/analysis/api/analyze/trigger/META` → `{"error":"Exception while reading from stream"}`
- `/api/analysis/api/patterns/META` → Same error
- Scheduled runs at 01:00 UTC fail with same error

### Fixes Already Applied (deployed)
1. **DbConnectionFactory.cs** - Added SSL/timeout settings to match TwelveData:
   ```csharp
   var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
   {
       CommandTimeout = 30,
       Timeout = 15,
       SslMode = SslMode.Require,
       Pooling = false
   };
   ```

2. **Program.cs** - Health check now uses same connection settings

3. **Database** - Added RLS policies for `analysis_stock_candlestick_pattern` table

### What Didn't Work
- Adding `OpenAsync().ConfigureAwait(false)` to repository methods (reverted due to CI/CD build failure)

## Key Observations

| Query Type | Method Used | Table(s) | Result |
|------------|-------------|----------|--------|
| Status | `QuerySingleOrDefaultAsync` | `fetch_schedules`, `data_sources` | ✅ Works |
| GetActiveTickers | `QueryAsync` | `stock_tickers` | ❌ Fails |
| GetPatterns | `QueryAsync` | `analysis_stock_candlestick_pattern`, `stock_tickers` | ❌ Fails |

**Pattern**: `QuerySingleOrDefaultAsync` works, `QueryAsync` (returning IEnumerable) fails.

## Files to Investigate

- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Repositories/StockPriceRepository.cs`
- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Repositories/AnalysisRepository.cs`

## Hypotheses to Test

1. **Dapper/Npgsql 8.0 type mapping** - `DateOnly` type handling might cause stream issues
2. **Supabase Supavisor pooler** - Connection behavior differs for multi-row results
3. **Container networking** - Timeout during result streaming

## Next Steps

1. Get container logs via SSH: `docker logs candlestick-analysis --tail 200`
2. Test with explicit Dapper TypeHandler for DateOnly
3. Try downgrading Npgsql to 7.x to test compatibility
4. Compare exact SQL execution between working and failing queries

## Test Commands

```bash
# Working endpoint
curl.exe -s "https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/api/status"

# Failing endpoint
curl.exe -s -X POST "https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/api/analyze/trigger/META?date=2025-12-31"
```

## Related Files
- Compare with working TwelveData: `services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/`

