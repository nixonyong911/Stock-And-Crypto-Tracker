# TwelveData Swagger API Implementation

**Date**: 2025-12-18  
**Purpose**: Added Swagger UI to TwelveData worker for manual API testing

## Summary

Converted the TwelveData background worker from a pure worker service to a Web API host with Swagger support. This allows manual triggering of data fetches for testing purposes.

## Changes Made

### 1. Project Configuration (`TwelveData.Worker.csproj`)

- Changed SDK from `Microsoft.NET.Sdk.Worker` to `Microsoft.NET.Sdk.Web`
- Added packages:
  - `Swashbuckle.AspNetCore` (6.5.0) - Swagger UI
  - `Serilog.AspNetCore` (8.0.0) - Web logging
  - `AspNetCore.HealthChecks.NpgSql` (8.0.2) - PostgreSQL health checks

### 2. Repository Layer

**`IStockTickerRepository.cs`** - Added new method:
```csharp
Task<StockTicker> GetOrCreateTickerAsync(string symbol, string exchange = "NASDAQ", string currency = "USD");
```

**`StockTickerRepository.cs`** - Implemented the method to:
- Find existing ticker by symbol
- Auto-create ticker if not found (with universe_id=1 for stocks)

### 3. Service Layer

**`IStockFetchService.cs`** - Added new method:
```csharp
Task<int> FetchSymbolAsync(string symbol, CancellationToken cancellationToken = default);
```

**`StockFetchService.cs`** - Implemented the method with:
- Hardcoded default config: `yesterday`, `15min` interval, `NASDAQ`, `30` candles
- Auto-creates ticker if not in database
- Returns number of records inserted

### 4. Program.cs

Rewrote to use `WebApplication.CreateBuilder` pattern with:
- Swagger/OpenAPI support
- Health check endpoints (`/health`, `/health/ready`, `/health/live`)
- Controller mapping
- Root endpoint with service info

### 5. New Controller (`Controllers/FetchController.cs`)

Created API controller with endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/fetch/trigger/{symbol}` | Fetch data for a specific symbol |
| GET | `/api/fetch/status` | Get service status and config |

### 6. Docker Configuration

**`Dockerfile`**:
- Changed runtime from `dotnet/runtime:8.0` to `dotnet/aspnet:8.0`
- Added curl installation for healthcheck
- Added `EXPOSE 8080`

**`docker-compose.yml`**:
- Added port mapping: `${TWELVEDATA_API_PORT:-8083}:8080`
- Added healthcheck configuration
- Added `ASPNETCORE_ENVIRONMENT` variable

## Files Modified

| File | Change Type |
|------|-------------|
| `TwelveData.Worker.csproj` | Modified |
| `Program.cs` | Rewritten |
| `Repositories/IStockTickerRepository.cs` | Modified |
| `Repositories/StockTickerRepository.cs` | Modified |
| `Services/IStockFetchService.cs` | Modified |
| `Services/StockFetchService.cs` | Modified |
| `Controllers/FetchController.cs` | **New file** |
| `Dockerfile` | Modified |
| `docker-compose.yml` | Modified |

## Swagger URL

After starting the service:

```
http://localhost:8083/swagger
```

(Port 8083 is the default, can be overridden with `TWELVEDATA_API_PORT` env var)

## How to Use

### 1. Start the Service

```bash
# Using Docker Compose
docker compose --env-file .env.staging up twelvedata-fetcher

# Or run locally
cd services/data-fetchers/TwelveData/src/TwelveData.Worker
dotnet run
```

### 2. Access Swagger UI

Open browser: `http://localhost:8083/swagger`

### 3. Trigger a Manual Fetch

1. Expand **POST /api/fetch/trigger/{symbol}**
2. Click "Try it out"
3. Enter a symbol (e.g., `AAPL`, `MSFT`, `GOOGL`)
4. Click "Execute"

### 4. Example Response

**Success (200 OK)**:
```json
{
  "success": true,
  "message": "Fetched 30 records for symbol AAPL.",
  "symbol": "AAPL",
  "recordsInserted": 30
}
```

**Error (400 Bad Request)**:
```json
{
  "success": false,
  "message": "TwelveData API error: Invalid symbol",
  "symbol": "INVALID"
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/swagger` | GET | Swagger UI |
| `/health` | GET | All health checks |
| `/health/ready` | GET | Ready check (includes DB) |
| `/health/live` | GET | Liveness check |
| `/api/fetch/trigger/{symbol}` | POST | Trigger fetch for symbol |
| `/api/fetch/status` | GET | Service status |

## Configuration

The manual fetch uses these hardcoded defaults:

| Parameter | Value |
|-----------|-------|
| fetch_date | yesterday |
| interval | 15min |
| output_size | 30 |
| exchange | NASDAQ |
| timezone | America/New_York |

## Notes

- Tickers are auto-created in `stock_tickers` table if they don't exist
- Fetched data is stored in `stock_prices` table
- The background worker schedule continues to run alongside the API
- Requires `TwelveData__ApiKey` environment variable to be set

## Database Connection Fix

The `DbConnectionFactory` was updated to disable local Npgsql connection pooling since Supabase uses its own transaction-mode pooler (port 6543). Key settings:

```csharp
var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
{
    CommandTimeout = 30,
    Timeout = 15,
    SslMode = SslMode.Require,
    Pooling = false  // Disable local pooling - Supabase has its own pooler
};
```

