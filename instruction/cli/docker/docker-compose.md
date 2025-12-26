# Docker Compose CLI

## Start Services

```powershell
# Start all services (detached)
docker-compose up -d

# Start with env file
docker-compose --env-file .env.staging up -d
```

## Logs

```powershell
# View all logs (follow mode)
docker-compose logs -f

# View logs for specific service
docker-compose logs -f alphavantage
```

## Build & Restart

```powershell
# Rebuild and restart all services
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build alphavantage
```

## Stop & Clean

```powershell
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```





