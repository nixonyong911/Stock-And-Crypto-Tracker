# Grafana Cloud CLI (grafanactl)

Manage Grafana Cloud resources from the command line.

---

## Installation

### Windows
```powershell
# Download from GitHub releases
# https://github.com/grafana/grafanactl/releases
# Extract to: $HOME\tools\grafanactl\
# Added to PATH automatically
```

### VM (Linux)
```bash
curl -LO "https://github.com/grafana/grafanactl/releases/download/v0.1.8/grafanactl_Linux_x86_64.tar.gz"
tar -xzf grafanactl_Linux_x86_64.tar.gz
sudo mv grafanactl /usr/local/bin/
rm grafanactl_Linux_x86_64.tar.gz
```

---

## Configuration

Config file locations:
- **Windows**: `%LOCALAPPDATA%\grafanactl\config.yaml`
- **Linux/VM**: `~/.config/grafanactl/config.yaml`

### Config File Structure
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
grafanactl resources pull -p ./grafana/      # Pull all resources to directory
grafanactl resources pull -p ./grafana/ --kind Dashboard  # Pull only dashboards
```

### Push Resources (Deploy)
```bash
grafanactl resources push -p ./grafana/      # Push all resources from directory
grafanactl resources validate -p ./grafana/  # Validate before pushing
```

### Edit Resources
```bash
grafanactl resources edit dashboards/<name>  # Edit dashboard in editor
```

### Delete Resources
```bash
grafanactl resources delete dashboards/<name>  # Delete a dashboard
```

---

## Common Workflows

### Export all dashboards for version control
```bash
mkdir -p ./grafana-resources
grafanactl resources pull -p ./grafana-resources/ --kind Dashboard
```

### Deploy dashboards from Git
```bash
grafanactl resources validate -p ./grafana-resources/
grafanactl resources push -p ./grafana-resources/
```

### Serve resources locally (preview)
```bash
grafanactl resources serve -p ./grafana-resources/
```

---

## Authentication

Token is stored in Infisical as `GRAFANA_SERVICE_ACCOUNT_TOKEN`.

To create a new token:
1. Go to https://stockandcryptotracker.grafana.net/org/serviceaccounts
2. Create service account with Admin role
3. Generate token (starts with `glsa_...`)

---

## Troubleshooting

```bash
grafanactl config check              # Verify connectivity
grafanactl --version                 # Check CLI version
grafanactl resources list -v         # Verbose output
```

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check token is `glsa_...` (service account), not `glc_...` (cloud policy) |
| Config not found | Check config path matches OS (Windows: AppData, Linux: .config) |
| Connection timeout | Verify server URL includes `https://` |



