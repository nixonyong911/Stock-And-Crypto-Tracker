# Service Endpoints

> **Infrastructure Reference**: See [infrastructure-config.md](../../../reference/infrastructure-config.md) for comprehensive configuration details.

---

## Base URL

```
https://nxserver.malaysiawest.cloudapp.azure.com
```

---

## Active Service Endpoints

| Service | Path | Purpose |
|---------|------|---------|
| **n8n** | `/` | Workflow automation dashboard |
| **Back-Office** | `/back-office` | Admin UI (data-fetchers, CLI testing) |
| **TwelveData Swagger** | `/api/twelvedata/swagger` | API documentation & testing |
| **TwelveData Health** | `/api/twelvedata/health/live` | Health check |
| **Metrics Swagger** | `/api/metrics/swagger` | Metrics API documentation |
| **Metrics Health** | `/api/metrics/health/live` | Health check |
| **Metrics Prometheus** | `/metrics` | Prometheus scrape endpoint |

---

## Internal Services (Not Publicly Accessible)

| Service | Internal URL | Purpose |
|---------|--------------|---------|
| **Alloy** | `http://localhost:12345` | Grafana Alloy metrics collector |
| **Caddy Admin** | `http://localhost:2019` | Caddy admin API (SSH only) |

---

## TwelveData API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/twelvedata/health/live` | GET | Liveness check |
| `/api/twelvedata/health/ready` | GET | Readiness check |
| `/api/twelvedata/api/fetch/trigger/{symbol}` | POST | Fetch single symbol |
| `/api/twelvedata/api/fetch/trigger/all` | POST | Fetch all active tickers |
| `/api/twelvedata/api/fetch/status` | GET | Get fetch status |
| `/api/twelvedata/swagger` | GET | Swagger UI |

---

## Metrics API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics/health/live` | GET | Liveness check |
| `/api/metrics/api/metrics` | POST | Record single metric |
| `/api/metrics/api/metrics/batch` | POST | Record batch metrics |
| `/api/metrics/swagger` | GET | Swagger UI |
| `/metrics` | GET | Prometheus scrape endpoint |

---

## Caddy Admin API (SSH Only)

```powershell
# SSH to VM first
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1

# View Caddy config
curl localhost:2019/config/ | jq

# View loaded certificates
curl localhost:2019/pki/ca/local | jq

# Reload Caddy configuration
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Adding New Routes

Edit `deployment/vm/Caddyfile` in repository:

```
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

Then reload Caddy:
```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker exec caddy caddy reload --config /etc/caddy/Caddyfile"
```

---

## Related

- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - All VM and service details
- [Docker Commands](docker-commands.md) - Container management
