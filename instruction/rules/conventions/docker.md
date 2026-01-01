# Docker & Container Conventions

## Local Development

```powershell
# Inject secrets from Infisical and run docker-compose
infisical run --env=prod -- docker-compose up -d
docker-compose logs -f
```

## Production (VM)

Services are defined in `deployment/vm/docker-compose.yml`

### Standard Service Template

```yaml
your-service:
  build:
    context: ./repo/services
    dockerfile: data-fetchers/YourWorker/Dockerfile
  container_name: your-service
  restart: unless-stopped
  networks:
    - stocktracker
  environment:
    - ConnectionStrings__DefaultConnection=${DATABASE_CONNECTION_STRING}
    - YourWorker__ApiKey=${YOUR_API_KEY}
    - Metrics__ServiceUrl=http://metrics:8080
    - ASPNETCORE_URLS=http://+:8080
    - PATH_BASE=/api/yourworker
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/health/live"]
    interval: 30s
    timeout: 10s
    retries: 3
```

## Caddy Reverse Proxy

Add routes to `deployment/vm/Caddyfile`:

```
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

**Remember**: Update `instruction/skills/cli-caddy/SKILL.md` when adding new routes.

