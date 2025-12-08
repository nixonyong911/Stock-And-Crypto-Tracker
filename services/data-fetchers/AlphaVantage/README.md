# Alpha Vantage Data Fetcher Service

.NET 8 Worker Service that fetches stock price data from the Alpha Vantage API and stores it in the PostgreSQL database.

## Overview

This service is part of the Stock and Crypto Tracker microservices architecture. It runs as a background worker that periodically fetches stock price data for configured symbols.

## Features

- Scheduled data fetching using `BackgroundService`
- Configurable fetch interval and stock symbols
- Automatic retry with exponential backoff
- Database upsert (insert or update) to handle duplicate data
- Fetch logging for monitoring and debugging
- Docker containerization support

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ConnectionStrings__DefaultConnection` | PostgreSQL connection string | Required |
| `AlphaVantage__ApiKey` | Alpha Vantage API key | Required |
| `AlphaVantage__BaseUrl` | Alpha Vantage API base URL | `https://www.alphavantage.co` |
| `AlphaVantage__FetchIntervalMinutes` | Interval between fetch cycles | `60` |
| `AlphaVantage__Symbols` | Comma-separated stock symbols | `AAPL,GOOGL,MSFT,AMZN,TSLA` |

### appsettings.json

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres"
  },
  "AlphaVantage": {
    "ApiKey": "your-api-key",
    "BaseUrl": "https://www.alphavantage.co",
    "FetchIntervalMinutes": 60,
    "Symbols": ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"]
  }
}
```

## Project Structure

```
AlphaVantage/
├── AlphaVantage.sln           # Solution file
├── Dockerfile                  # Docker build configuration
├── README.md                   # This file
└── src/
    └── AlphaVantage.Worker/
        ├── Configuration/      # Settings classes
        ├── Models/             # Data models and API responses
        ├── Repositories/       # Database access layer
        ├── Services/           # API client and business logic
        ├── Workers/            # Background service worker
        ├── Program.cs          # Application entry point
        └── appsettings.json    # Configuration file
```

## Development

### Prerequisites

- .NET 8 SDK
- PostgreSQL database (or use Docker Compose)
- Alpha Vantage API key (free at https://www.alphavantage.co/support/#api-key)

### Running Locally

1. Start the database (if not using Docker):
   ```bash
   docker-compose up postgres -d
   ```

2. Configure your API key:
   ```bash
   cd services/data-fetchers/AlphaVantage
   # Edit src/AlphaVantage.Worker/appsettings.json with your API key
   ```

3. Run the service:
   ```bash
   dotnet run --project src/AlphaVantage.Worker
   ```

### Running with Docker

```bash
# From project root
docker-compose up alpha-vantage-fetcher
```

### Running Tests

```bash
dotnet test
```

## API Rate Limits

Alpha Vantage free tier limitations:
- 5 API calls per minute
- 500 API calls per day

The service includes a 15-second delay between symbol fetches to stay within rate limits.

## Database Tables Used

- `stocks` - Master list of tracked stocks
- `stock_prices` - Historical and current price data
- `data_sources` - Registered data source (AlphaVantage)
- `fetch_logs` - Operation audit trail

## Extending This Service

### Adding New Endpoints

1. Add response models in `Models/AlphaVantageResponses.cs`
2. Add interface methods in `Services/IAlphaVantageApiClient.cs`
3. Implement in `Services/AlphaVantageApiClient.cs`
4. Update the fetch service to use new endpoints

### Adding New Symbols

Update the `AlphaVantage__Symbols` environment variable or configuration:

```bash
# In .env
ALPHA_VANTAGE_SYMBOLS=AAPL,GOOGL,MSFT,AMZN,TSLA,NVDA,META
```

## Troubleshooting

### Common Issues

1. **"Data source 'AlphaVantage' not found"**
   - Ensure the database init script ran successfully
   - Check if the `data_sources` table contains the AlphaVantage entry

2. **API rate limit exceeded**
   - Increase `FetchIntervalMinutes`
   - Reduce the number of symbols
   - Consider upgrading to a paid Alpha Vantage plan

3. **Connection refused to database**
   - Ensure PostgreSQL is running
   - Check the connection string
   - Verify network connectivity (especially in Docker)

## License

MIT License

