# Docker CLI Skill

## Overview

Docker and Docker Compose commands for managing the Stock Tracker services locally and on the VM.

---

## Start Services

```powershell
# Start all services (detached)
docker-compose up -d

# Start with Infisical secrets injected
infisical run --env=prod -- docker-compose up -d

# Start with specific env file
docker-compose --env-file .env.staging up -d
```

---

## View Logs

```powershell
# View all logs (follow mode)
docker-compose logs -f

# View logs for specific service
docker-compose logs -f twelvedata
docker-compose logs -f metrics
docker-compose logs -f back-office

# View last N lines
docker-compose logs --tail 50 twelvedata
```

---

## Build & Restart

```powershell
# Rebuild and restart all services
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build twelvedata

# Force recreate without cache
docker-compose up -d --build --no-cache
```

---

## Stop & Clean

```powershell
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Remove all stopped containers
docker container prune -f

# Remove unused images
docker image prune -f
```

---

## Container Management

```powershell
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# Execute command in container
docker exec -it twelvedata bash

# View container resource usage
docker stats
```

---

## Related

- [vm-operations](../../../rules/vm-operations.md) - VM Docker commands
- [cicd-deployment](../../../rules/cicd-deployment.md) - CI/CD pipeline

