# EF Core Migrations CLI

## Project Location

```
services/common/StockTracker.Data.Migrations/
```

## CLI Tool Usage

```powershell
# Navigate to the migrations project
cd services/common/StockTracker.Data.Migrations

# Show help
dotnet run -- help

# Check migration status
dotnet run -- status

# Apply pending migrations
dotnet run -- migrate
```

## Generate Migrations

```powershell
# Add a new migration
dotnet ef migrations add <MigrationName>

# List all migrations
dotnet ef migrations list

# Remove last migration (if not applied)
dotnet ef migrations remove

# Generate SQL script
dotnet ef migrations script -o migration.sql
```

## Configuration

Configuration priority (highest to lowest):

1. Environment variables
2. Root `.env.staging` file (`DATABASE_CONNECTION_STRING`)
3. `appsettings.json` (`ConnectionStrings:StockTrackerDb`)

### Using .env.staging (Recommended)

Place `.env.staging` at project root with:

```
DATABASE_CONNECTION_STRING=Host=your-host;Port=5432;Database=postgres;Username=postgres;Password=your-password
```

### Using Environment Variable

```powershell
$env:DATABASE_CONNECTION_STRING = "your-connection-string"
```

### Using appsettings.json (Local Development)

```json
{
  "ConnectionStrings": {
    "StockTrackerDb": "Host=localhost;Port=5432;Database=stocktracker;Username=postgres;Password=postgres"
  }
}
```









