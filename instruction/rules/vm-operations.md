# Azure VM Operations

When user asks to "check VM", "connect to VM", "check services", or similar:

> **📚 Infrastructure Reference**: See [Infrastructure Configuration](../reference/infrastructure-config.md) for comprehensive VM details, ports, and service endpoints.

## VM Details

| Detail | Value |
|--------|-------|
| Alias | `ssh-azure` |
| Host | `20.17.176.1` |
| User | `azureuser` |
| FQDN | `nxserver.malaysiawest.cloudapp.azure.com` |
| Deploy Path | `/opt/stocktracker` |
| Services | Caddy, n8n, TwelveData, Metrics, Back-office, Alloy, AI Hub |

> **Note**: These values are centralized in [Infrastructure Configuration](../reference/infrastructure-config.md). If infrastructure changes, update that file first.

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

## Common Docker Commands (Inside VM)

| Command | Purpose |
|---------|---------|
| `docker ps` | List running containers |
| `docker logs <service>` | Check service logs |
| `docker compose logs -f` | Follow all logs |
| `docker compose up -d --build <service>` | Rebuild and restart |

## AI Hub Commands (systemd service)

| Command | Purpose |
|---------|---------|
| `sudo systemctl status ai-hub` | Check AI Hub status |
| `sudo systemctl restart ai-hub` | Restart AI Hub |
| `journalctl -u ai-hub -f` | Follow AI Hub logs |
| `journalctl -u ai-hub --since "10 min ago"` | Recent logs |

## Service URLs

| Service | URL |
|---------|-----|
| n8n Dashboard | https://nxserver.malaysiawest.cloudapp.azure.com/ |
| TwelveData Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/swagger |
| TwelveData Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/twelvedata/health/live |
| Metrics Swagger | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/swagger |
| Metrics Health | https://nxserver.malaysiawest.cloudapp.azure.com/api/metrics/health/live |
| Back Office | https://nxserver.malaysiawest.cloudapp.azure.com/back-office/ |
| AI Hub Health | localhost:8084/health/live (via SSH only) |

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
