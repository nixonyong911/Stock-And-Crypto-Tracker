# Azure VM Operations

## Overview

Commands and references for managing the Azure VM that hosts backend services.

> **Infrastructure Reference**: See [Infrastructure Configuration](../../../reference/infrastructure-config.md) for comprehensive VM details, ports, and service endpoints.

---

## VM Details

| Detail | Value |
|--------|-------|
| Alias | `ssh-azure` |
| Host | `20.17.176.1` |
| User | `azureuser` |
| FQDN | `nxserver.malaysiawest.cloudapp.azure.com` |
| Deploy Path | `/opt/stocktracker` |
| Services | Caddy, n8n, TwelveData, Metrics, Back-office, Alloy, AI Hub 2.0 |

> **Note**: These values are centralized in [Infrastructure Configuration](../../../reference/infrastructure-config.md). If infrastructure changes, update that file first.

---

## Direct SSH Commands (Preferred for AI)

For non-interactive commands, use direct SSH with command argument (faster, no session needed):

```powershell
# Direct SSH command format (preferred)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "<command>"

# Examples:
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps"
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata --tail 50"
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d"
```

**Fallback**: If direct SSH fails, use `ssh-azure` for interactive session.

---

## Common Docker Commands (Inside VM)

| Command | Purpose |
|---------|---------|
| `docker ps` | List running containers |
| `docker logs <service>` | Check service logs |
| `docker compose logs -f` | Follow all logs |
| `docker compose up -d --build <service>` | Rebuild and restart |

---

## AI Hub 2.0 Commands (Docker container)

| Command | Purpose |
|---------|---------|
| `docker ps --filter name=ai-hub2` | Check AI Hub 2.0 status |
| `docker restart ai-hub2` | Restart AI Hub 2.0 |
| `docker logs ai-hub2 -f` | Follow AI Hub 2.0 logs |
| `docker logs ai-hub2 --since "10m"` | Recent logs |

---

## Service URLs

| Service | URL |
|---------|-----|
| n8n Dashboard | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| TwelveData Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live |
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger |
| Metrics Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live |
| Back Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office/ |
| AI Hub 2.0 Health | ai-hub2:8080/health/live (Docker network) |

---

## Key Commands

### EF Migrations

```powershell
cd services/common/StockTracker.Data.Migrations
dotnet run -- migrate     # Apply migrations
dotnet run -- status      # Check status
dotnet ef migrations add <Name>  # New migration
```

### Docker (Local with Infisical)

```powershell
# Inject secrets from Infisical and run docker-compose
infisical run --env=prod -- docker-compose up -d
docker-compose logs -f
```

### VM Deployment (Manual)

```powershell
# SSH and restart services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d"
```

---

## Related

- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - Full VM details
- [docker](../docker/REFERENCE.md) - Docker commands
- [powershell](../powershell/REFERENCE.md) - PowerShell functions including ssh-azure

