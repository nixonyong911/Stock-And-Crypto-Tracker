# CLI Commands Reference

This folder contains documentation for various CLI commands and tools used in the project.

## Documentation Style

Keep CLI docs **straightforward** - commands only, no explanations needed.

- Use code blocks with comments for context
- Group related commands under clear headings
- Include configuration snippets where relevant
- See [ef-migrations.md](ef-migrations.md) as reference

## Documents

| Document | Description |
|----------|-------------|
| [ef-migrations.md](ef-migrations.md) | EF Core database migrations CLI commands |

## Quick Reference

### Database Migrations

```powershell
cd services/common/StockTracker.Data.Migrations

# Check status
dotnet run -- status

# Apply migrations
dotnet run -- migrate

# Generate new migration
dotnet ef migrations add <MigrationName>
```

### Azure Container Apps

```powershell
# List container apps
az containerapp list --resource-group rg-stocktracker -o table

# View logs
az containerapp logs show --name ca-alphavantage --resource-group rg-stocktracker --follow

# Health check
Invoke-WebRequest -Uri "https://ca-alphavantage.calmwater-f6ffc3da.southeastasia.azurecontainerapps.io/health/live" -UseBasicParsing
```

### Docker (Local Development)

```powershell
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild and restart
docker-compose up -d --build
```

### Git & GitHub

```powershell
# Trigger GitHub Actions manually
gh workflow run "Deploy to Azure Container Apps"

# Check workflow status
gh run list --workflow=deploy-azure.yml
```

### Vercel (Frontend)

```bash
# Install CLI
npm i -g vercel

# Deploy manually
cd services/frontend
vercel --prod
```

## Categories

| Category | Documents |
|----------|-----------|
| Database | [ef-migrations.md](ef-migrations.md) |
| *Coming soon* | Docker commands |
| *Coming soon* | Azure CLI commands |

