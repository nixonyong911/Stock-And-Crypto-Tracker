# TwelveData Worker

A .NET 8 background worker service that fetches 15-minute OHLC candle data from the [Twelve Data API](https://twelvedata.com/docs#time-series) for NASDAQ stocks.

## Features

- Fetches stock symbols from `stock_tickers` table (filtered by exchange=NASDAQ, currency=USD)
- Retrieves 15-minute interval OHLC data via Twelve Data `/time_series` endpoint
- Converts America/New_York timestamps to UTC before storage
- Stores data in `stock_prices` table with proper foreign key references
- Automatic retry policy for transient HTTP failures
- Configurable fetch interval (default: 15 minutes)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TWELVE_DATA_API_KEY` | Your Twelve Data API key | (required) |
| `TWELVE_DATA_FETCH_INTERVAL` | Fetch interval in minutes | `15` |
| `TWELVE_DATA_OUTPUT_SIZE` | Number of candles to fetch | `96` (24 hours) |
| `DATABASE_CONNECTION_STRING` | PostgreSQL connection string | (required) |

### appsettings.json

```json
{
  "TwelveData": {
    "ApiKey": "",
    "BaseUrl": "https://api.twelvedata.com",
    "FetchIntervalMinutes": 15,
    "OutputSize": 96,
    "Interval": "15min",
    "Exchange": "NASDAQ",
    "Timezone": "America/New_York"
  },
  "ConnectionStrings": {
    "DefaultConnection": "Host=...;Port=5432;Database=postgres;..."
  }
}
```

## Prerequisites

1. **Database Setup**: Ensure the `data_sources` table has a "TwelveData" entry:

```sql
INSERT INTO data_sources (name, description, base_url, supports_stocks, is_active)
VALUES ('TwelveData', 'Twelve Data Financial API', 'https://api.twelvedata.com', true, true);
```

2. **Stock Tickers**: Add stocks to the `stock_tickers` table with `exchange='NASDAQ'` and `currency='USD'`

## Running Locally

```bash
cd services/data-fetchers/TwelveData/src/TwelveData.Worker
dotnet run
```

## Running with Docker

```bash
# From project root
docker-compose --env-file .env.staging up twelvedata-fetcher
```

## API Response Format

The worker fetches data from:
```
GET https://api.twelvedata.com/time_series
  ?symbol=AAPL
  &interval=15min
  &exchange=NASDAQ
  &timezone=America/New_York
  &outputsize=96
  &apikey=YOUR_API_KEY
```

Response:
```json
{
  "meta": {
    "symbol": "AAPL",
    "interval": "15min",
    "currency": "USD",
    "exchange": "NASDAQ"
  },
  "values": [
    {
      "datetime": "2024-12-12 15:45:00",
      "open": "245.50",
      "high": "246.00",
      "low": "245.25",
      "close": "245.75",
      "volume": "1234567"
    }
  ],
  "status": "ok"
}
```

## Architecture

This is a **pure worker service** (no HTTP endpoints):
- Uses `Microsoft.NET.Sdk.Worker`
- `BackgroundService` runs fetch loop on configured interval
- Serilog for structured logging to console
- Dapper for database queries
- Polly for HTTP retry policies

## Rate Limiting

The worker includes an 8-second delay between API calls to avoid hitting Twelve Data rate limits. Adjust this based on your API plan tier.

