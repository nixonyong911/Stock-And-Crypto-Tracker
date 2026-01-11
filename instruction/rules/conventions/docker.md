# Docker & Container Conventions

**Last Updated**: 2026-01-01
**Applies To**: All containerized services on Azure VM

---

## Local Development

```powershell
# Inject secrets from Infisical and run docker-compose
infisical run --env=prod -- docker-compose up -d
docker-compose logs -f
```

---

## Multi-Stage Builds

### Why Multi-Stage?

- **Smaller images**: Only production dependencies in final image
- **Faster builds**: Leverage caching between stages
- **Security**: Build tools not included in final image
- **Clarity**: Separate build and runtime concerns

### .NET Multi-Stage Example

```dockerfile
# ===========================================
# Stage 1: Build
# ===========================================
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src

# Copy project files (layer cache optimization)
COPY ["data-fetchers/TwelveData/TwelveData.csproj", "data-fetchers/TwelveData/"]
COPY ["common/StockTracker.Data/StockTracker.Data.csproj", "common/StockTracker.Data/"]
COPY ["common/StockTracker.Common/StockTracker.Common.csproj", "common/StockTracker.Common/"]

# Restore dependencies (cached if .csproj unchanged)
RUN dotnet restore "data-fetchers/TwelveData/TwelveData.csproj"

# Copy source code
COPY . .

# Build and publish
WORKDIR "/src/data-fetchers/TwelveData"
RUN dotnet publish "TwelveData.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ===========================================
# Stage 2: Runtime
# ===========================================
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS final

# Security: Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy only published output from build stage
COPY --from=build /app/publish .

# Security: Run as non-root
USER appuser

EXPOSE 8080

ENTRYPOINT ["dotnet", "TwelveData.dll"]
```

### Next.js Multi-Stage Example

```dockerfile
# ===========================================
# Stage 1: Dependencies
# ===========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files only
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ===========================================
# Stage 2: Build
# ===========================================
FROM node:20-alpine AS build
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for Next.js env vars
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# ===========================================
# Stage 3: Runtime
# ===========================================
FROM node:20-alpine AS final

WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nextjs -G nodejs

# Copy built application
COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Security: Run as non-root
USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
```

---

## Layer Caching Strategies

### Order Matters

Optimize Dockerfile layer order to maximize cache hits:

```dockerfile
# ✅ GOOD - Dependencies cached separately from source
FROM node:20-alpine
WORKDIR /app

# Layer 1: Package metadata (changes rarely)
COPY package.json package-lock.json ./

# Layer 2: Dependencies (cached if package.json unchanged)
RUN npm ci

# Layer 3: Source code (changes frequently)
COPY . .

# Layer 4: Build (cached if source unchanged)
RUN npm run build

# ❌ BAD - Source changes invalidate all layers
FROM node:20-alpine
WORKDIR /app
COPY . .                    # Invalidates cache on ANY file change
RUN npm ci                  # Re-downloads deps every time
RUN npm run build
```

### .dockerignore File

Prevent unnecessary files from invalidating cache:

```.dockerignore
# Node
node_modules/
npm-debug.log
.npm/

# .NET
bin/
obj/
*.user
*.suo

# Git
.git/
.gitignore

# IDE
.vscode/
.idea/
*.swp

# Documentation
*.md
!README.md

# Tests
**/*.test.ts
**/*.spec.ts
__tests__/

# Environment
.env
.env.local
.env.*.local

# Build artifacts
dist/
.next/
out/
```

### BuildKit Cache Mounts

Use BuildKit for advanced caching:

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine

# Enable BuildKit cache for npm
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Enable BuildKit cache for apt packages (Debian-based images)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y curl
```

Build with BuildKit:
```bash
DOCKER_BUILDKIT=1 docker build -t myapp .
```

---

## Security Best Practices

### 1. Use Minimal Base Images

```dockerfile
# ❌ AVOID - Large attack surface
FROM ubuntu:latest

# ⚠️ ACCEPTABLE - Smaller but still includes shell
FROM node:20-alpine

# ✅ BEST - Minimal, no shell or package manager
FROM gcr.io/distroless/nodejs20
```

### 2. Run as Non-Root User

```dockerfile
# ❌ BAD - Runs as root (default)
FROM node:20-alpine
WORKDIR /app
COPY . .
CMD ["node", "index.js"]

# ✅ GOOD - Runs as non-root
FROM node:20-alpine
WORKDIR /app

# Create user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

COPY --chown=appuser:appuser . .

USER appuser

CMD ["node", "index.js"]
```

### 3. Scan for Vulnerabilities

```bash
# Scan image for known vulnerabilities
docker scan myapp:latest

# Use Trivy for comprehensive scanning
trivy image myapp:latest

# Fail CI/CD if critical vulnerabilities found
trivy image --exit-code 1 --severity CRITICAL myapp:latest
```

### 4. Use Specific Image Tags

```dockerfile
# ❌ BAD - Unpredictable, can break builds
FROM node:latest

# ⚠️ BETTER - Major version pinned
FROM node:20-alpine

# ✅ BEST - Specific digest (immutable)
FROM node:20-alpine@sha256:abc123...

# Or specific version
FROM node:20.11.0-alpine3.19
```

### 5. Minimize Secrets Exposure

```dockerfile
# ❌ BAD - Secrets in final image
ARG DATABASE_PASSWORD
ENV DATABASE_PASSWORD=$DATABASE_PASSWORD

# ✅ GOOD - Secrets via runtime env vars
# Pass at runtime: docker run -e DATABASE_PASSWORD=xxx

# For build-time secrets, use BuildKit secret mounts
# docker build --secret id=apikey,src=.env .
RUN --mount=type=secret,id=apikey \
    API_KEY=$(cat /run/secrets/apikey) && \
    curl -H "Authorization: Bearer $API_KEY" https://api.example.com
```

---

## Health Check Patterns

### Basic HTTP Health Check

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health/live || exit 1
```

### Comprehensive Health Check

```dockerfile
# Install curl in minimal images
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine
RUN apk add --no-cache curl

# Health check with detailed options
HEALTHCHECK \
  --interval=30s \        # Check every 30 seconds
  --timeout=10s \         # 10 second timeout
  --start-period=30s \    # Grace period for startup
  --retries=3 \           # Retry 3 times before marking unhealthy
  CMD curl -f http://localhost:8080/health/live || exit 1
```

### Health Check Script

```dockerfile
# Copy health check script
COPY healthcheck.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/healthcheck.sh

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["/usr/local/bin/healthcheck.sh"]
```

```bash
# healthcheck.sh
#!/bin/sh
set -e

# Check HTTP endpoint
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health/live)

if [ "$response" = "200" ]; then
  exit 0
else
  echo "Health check failed with status $response"
  exit 1
fi
```

### Health Check in docker-compose

```yaml
services:
  api:
    image: myapi:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health/live"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 30s
```

---

## Build Arguments vs Environment Variables

### Build Arguments (ARG)

- Available **only during build**
- Not persisted in final image
- Use for build-time configuration

```dockerfile
# Define build arguments
ARG NODE_VERSION=20
ARG BUILD_DATE
ARG GIT_COMMIT

FROM node:${NODE_VERSION}-alpine

# Use in build
LABEL build_date=${BUILD_DATE}
LABEL git_commit=${GIT_COMMIT}

# Build command:
# docker build --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") .
```

### Environment Variables (ENV)

- Available **during build AND runtime**
- Persisted in final image
- Use for runtime configuration

```dockerfile
# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# These are baked into the image
```

### Best Practices

```dockerfile
# ✅ GOOD - ARG for build config, ENV for runtime
ARG BUILD_VERSION=1.0.0
ENV APP_VERSION=${BUILD_VERSION}

# ✅ GOOD - Override ENV at runtime
# docker run -e LOG_LEVEL=debug myapp

# ❌ BAD - Secrets as ENV (visible in image)
ENV DATABASE_PASSWORD=secret123

# ✅ GOOD - Secrets at runtime only
# docker run -e DATABASE_PASSWORD=secret123 myapp
```

---

## Resource Limits

### Memory Limits

```yaml
# docker-compose.yml
services:
  api:
    image: myapi:latest
    deploy:
      resources:
        limits:
          memory: 512M        # Hard limit
        reservations:
          memory: 256M        # Soft limit
```

### CPU Limits

```yaml
services:
  api:
    image: myapi:latest
    deploy:
      resources:
        limits:
          cpus: '1.0'         # 100% of 1 CPU
        reservations:
          cpus: '0.5'         # 50% of 1 CPU
```

### Combined Limits

```yaml
services:
  twelvedata:
    build:
      context: ./repo/services
      dockerfile: data-fetchers/TwelveData/Dockerfile
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.25'
          memory: 256M
      restart_policy:
        condition: unless-stopped
        delay: 5s
        max_attempts: 3
```

---

## Standard Service Template

### Production Service (VM)

```yaml
# deployment/vm/docker-compose.yml
your-service:
  build:
    context: ./repo/services
    dockerfile: data-fetchers/YourWorker/Dockerfile
    # Build arguments for Next.js NEXT_PUBLIC_* vars
    args:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
  container_name: your-service
  restart: unless-stopped
  networks:
    - stocktracker
  extra_hosts:
    - "host.docker.internal:host-gateway"  # Access host services (AI Hub)
  environment:
    # Runtime environment variables (injected by Infisical)
    - ASPNETCORE_ENVIRONMENT=Production
    - ASPNETCORE_URLS=http://+:8080
    - PATH_BASE=/api/yourworker
    - ConnectionStrings__DefaultConnection=${DATABASE_CONNECTION_STRING}
    - YourWorker__ApiKey=${YOUR_API_KEY}
    - AI_HUB_URL=http://ai-hub-docker:8080
    - AI_HUB_API_KEY=${AI_HUB_API_KEY}
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8080/health/live"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 30s
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 512M
      reservations:
        cpus: '0.25'
        memory: 128M
```

---

## Caddy Reverse Proxy Integration

### Adding New Service

1. **Add service to docker-compose.yml**
2. **Add Caddy route** to `deployment/vm/Caddyfile`:

```caddyfile
# Caddyfile
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

3. **Update documentation** in `instruction/skills/cli/References/caddy/REFERENCE.md`

---

## Common Patterns

### Logging to stdout/stderr

```dockerfile
# ✅ GOOD - Logs to stdout (collected by Docker)
CMD ["dotnet", "YourApp.dll"]

# Configure app to log to console, not files
# Docker will collect stdout/stderr
```

### Volume Mounts

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    volumes:
      # Named volume (managed by Docker)
      - n8n-data:/home/node/.n8n

      # Bind mount (host directory)
      - ./Caddyfile:/etc/caddy/Caddyfile:ro  # :ro = read-only

volumes:
  n8n-data:  # Docker-managed volume
```

### Network Communication

```yaml
networks:
  stocktracker:
    driver: bridge

services:
  api:
    networks:
      - stocktracker
    # Can reach other services by container name:
    # http://metrics:8080
    # http://twelvedata:8080
```

---

## Development vs Production

### Local Development

```dockerfile
# Dockerfile.dev
FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install  # Include dev dependencies

# Copy source (hot reload with volumes)
COPY . .

# Development server
CMD ["npm", "run", "dev"]
```

```yaml
# docker-compose.dev.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app              # Hot reload
      - /app/node_modules   # Don't override node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
```

### Production

```dockerfile
# Dockerfile (production)
# Multi-stage build as shown earlier
# Minimal image, no dev dependencies
```

---

## Troubleshooting

### View Logs

```bash
# Follow logs for all services
docker compose logs -f

# Logs for specific service
docker logs -f twelvedata

# Last 100 lines
docker logs --tail 100 twelvedata

# Logs since specific time
docker logs --since 10m twelvedata
```

### Inspect Container

```bash
# Check running processes
docker exec twelvedata ps aux

# Shell into container (if shell available)
docker exec -it twelvedata sh

# Check environment variables
docker exec twelvedata env

# Check disk usage
docker system df

# Remove unused images/containers
docker system prune -a
```

### Health Check Status

```bash
# View health status
docker inspect --format='{{.State.Health.Status}}' twelvedata

# View health check logs
docker inspect --format='{{json .State.Health}}' twelvedata | jq
```

---

## Related Documentation

- [Security Best Practices](../security.md)
- [Infrastructure Configuration](../../reference/infrastructure-config.md)
- [C# Conventions](./csharp.md)
- [TypeScript Conventions](./typescript.md)
