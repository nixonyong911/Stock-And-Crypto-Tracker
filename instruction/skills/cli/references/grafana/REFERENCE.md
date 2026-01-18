# Grafana CLI Skill

## Overview

Manage Grafana Cloud resources (dashboards, folders) from the command line using `grafanactl`.

---

## Installation

### Windows

```powershell
# Download from GitHub releases
# https://github.com/grafana/grafanactl/releases
# Extract to: $HOME\tools\grafanactl\
# Add to PATH
```

### Linux (VM)

```bash
curl -LO "https://github.com/grafana/grafanactl/releases/download/v0.1.8/grafanactl_Linux_x86_64.tar.gz"
tar -xzf grafanactl_Linux_x86_64.tar.gz
sudo mv grafanactl /usr/local/bin/
rm grafanactl_Linux_x86_64.tar.gz
```

---

## Configuration

Config locations:
- **Windows**: `%LOCALAPPDATA%\grafanactl\config.yaml`
- **Linux**: `~/.config/grafanactl/config.yaml`

```yaml
contexts:
  stocktracker:
    grafana:
      server: https://stockandcryptotracker.grafana.net
      token: <GRAFANA_SERVICE_ACCOUNT_TOKEN>
current-context: stocktracker
```

### Config Commands

```bash
grafanactl config check           # Verify configuration
grafanactl config view            # Display current config
grafanactl config list-contexts   # List all contexts
grafanactl config use-context stocktracker  # Switch context
```

---

## Resource Management

### List Resources

```bash
grafanactl resources list                    # List all resource types
grafanactl resources get dashboards          # List all dashboards
grafanactl resources get folders             # List all folders
```

### Pull Resources (Export)

```bash
grafanactl resources pull -p ./grafana/      # Pull all resources
grafanactl resources pull -p ./grafana/ --kind Dashboard  # Pull only dashboards
```

### Push Resources (Deploy)

```bash
grafanactl resources validate -p ./grafana/  # Validate before pushing
grafanactl resources push -p ./grafana/      # Push all resources
```

---

## Common Workflows

### Export dashboards for version control

```bash
mkdir -p ./grafana-resources
grafanactl resources pull -p ./grafana-resources/ --kind Dashboard
```

### Deploy dashboards from Git

```bash
grafanactl resources validate -p ./grafana-resources/
grafanactl resources push -p ./grafana-resources/
```

---

## Authentication

Token stored in Infisical as `GRAFANA_SERVICE_ACCOUNT_TOKEN`.

To create a new token:
1. Go to https://stockandcryptotracker.grafana.net/org/serviceaccounts
2. Create service account with Admin role
3. Generate token (starts with `glsa_...`)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Token must be `glsa_...` (service account), not `glc_...` (cloud policy) |
| Config not found | Check path matches OS (Windows: AppData, Linux: .config) |
| Connection timeout | Verify server URL includes `https://` |

---

## Related

- [observability-guide](../../../reference/observability-guide.md) - Metrics and monitoring
- [metrics-specification](../../../reference/metrics-specification.md) - Metrics format

