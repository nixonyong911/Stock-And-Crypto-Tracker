# Docker Commands

Docker and Docker Compose commands for managing Stock Tracker services locally and on VM.

---

## Local Development

### Start Services (With Secrets)

```powershell
# Start all services with Infisical secrets injected
infisical run --env=prod -- docker-compose up -d

# Start with build
infisical run --env=prod -- docker-compose up -d --build

# Start specific service
infisical run --env=prod -- docker-compose up -d twelvedata
```

### View Logs

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

### Build & Restart

```powershell
# Rebuild and restart all services
docker-compose up -d --build

# Rebuild specific service
docker-compose up -d --build twelvedata

# Force recreate without cache
docker-compose up -d --build --no-cache
```

### Stop & Clean

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

## VM Operations (Via SSH)

### Check Containers

```powershell
# List running containers
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps"

# List all containers (including stopped)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps -a"

# Check specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps --filter name=twelvedata"
```

### View VM Logs

```powershell
# Specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata --tail 50"

# Follow logs
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata -f"

# All services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose logs -f"
```

### Restart VM Services

```powershell
# Restart specific service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart twelvedata"

# Restart all services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart"

# Rebuild and restart (uses Infisical via start-services.sh)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d --build"
```

---

## Container Management

```powershell
# Execute command in container (local)
docker exec -it twelvedata bash

# Execute command in container (VM)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker exec twelvedata <command>"

# View container resource usage
docker stats

# Inspect container
docker inspect twelvedata
```

---

## Troubleshooting

### Container Won't Start

```powershell
# Check container logs for errors
docker logs <container-name>

# Check if port is already in use
docker ps -a

# Remove and recreate
docker-compose up -d --force-recreate <service-name>
```

### Permission Issues

```powershell
# Fix volume permissions (if needed)
sudo chown -R $USER:$USER ./n8n-data
```

### Network Issues

```powershell
# Recreate network
docker-compose down
docker network prune
docker-compose up -d
```

---

## Related

- [Service Endpoints](service-endpoints.md) - Service URLs and ports
- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - VM and service details
