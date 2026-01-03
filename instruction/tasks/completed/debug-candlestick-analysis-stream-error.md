# Debug CandlestickAnalysis Stream Error

## Status: RESOLVED ✅

## Problem
CandlestickAnalysis worker fails with `"Exception while reading from stream"` error when querying certain database tables.

## Resolution Summary (2026-01-03)

The issue was caused by **Npgsql 8.0 + Supavisor incompatibility** with multi-row result streaming.

### Root Cause
1. **Supavisor connection pooler** doesn't fully support Npgsql 8.0's multiplexing mode
2. **DateOnly type** wasn't natively supported by Dapper, causing parameter binding failures
3. **Dynamic query results** had property name mapping issues with Npgsql 8.0

### Fixes Applied

1. **DbConnectionFactory.cs** - Comprehensive connection settings:
   ```csharp
   var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
   {
       CommandTimeout = 60,
       Timeout = 30,
       SslMode = SslMode.Require,
       Pooling = false,
       Multiplexing = false,      // Required for Supavisor
       Enlist = false,
       KeepAlive = 30,
       TcpKeepAlive = true,
       ReadBufferSize = 8192,
       WriteBufferSize = 8192,
       NoResetOnClose = true
   };
   ```

2. **DateOnlyTypeHandler.cs** - Custom Dapper type handler for DateOnly:
   ```csharp
   SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
   SqlMapper.AddTypeHandler(new NullableDateOnlyTypeHandler());
   ```

3. **AnalysisDbRow.cs** - Strongly-typed model for query results (avoids dynamic property name issues)

4. **Repository methods** - Explicit `OpenAsync()` and `AsList()` for Supavisor compatibility

### Verification

All endpoints now working:
```bash
# Status endpoint
curl.exe -s "https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/status"
# ✅ Returns schedule info

# Trigger single stock analysis
curl.exe -s -X POST "https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/trigger/META?date=2025-12-31"
# ✅ {"success":true,"candlesAggregated":26,...}

# Get patterns
curl.exe -s "https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/patterns/META"
# ✅ {"symbol":"META","count":1,"results":[...]}

# Batch analysis
curl.exe -s -X POST "https://nxserver.malaysiawest.cloudapp.azure.com/api/analysis/trigger/all?date=2025-12-30"
# ✅ {"success":true,"totalStocks":8,"successCount":8,...}
```

## Files Modified

- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Repositories/DbConnectionFactory.cs`
- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Repositories/StockPriceRepository.cs`
- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Repositories/AnalysisRepository.cs`
- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Program.cs`
- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Infrastructure/DateOnlyTypeHandler.cs` (new)
- `services/workers/analysis/CandlestickAnalysis/src/CandlestickAnalysis.Worker/Models/AnalysisDbRow.cs` (new)

## Commits

- `0e1cd59` fix: add comprehensive connection settings for Supavisor compatibility
- `26fcbe1` fix: add Dapper DateOnly type handler for Npgsql 8.0 compatibility
- `e76f4cb` fix: use strongly-typed query model for GetAnalysisAsync

