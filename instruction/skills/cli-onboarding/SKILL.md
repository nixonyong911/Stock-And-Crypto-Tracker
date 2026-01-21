---
name: cli-onboarding
description: Quick reference for CLI authentication. Use when setting up a new machine, troubleshooting CLI auth issues, or onboarding to the dev container. Triggers on "cli login", "setup cli", "authenticate", "gh login", "az login", "infisical login", "new machine setup", "dev container setup", "not authenticated", "command not found".
---

# CLI Onboarding

One-time setup commands for each machine. Run **OUTSIDE** the dev container (on host).

## Authentication Commands

| CLI | Login Command | Auth Location |
|-----|---------------|---------------|
| **GitHub** | `gh auth login` | `~/.config/gh/` |
| **Azure** | `az login` | `~/.azure/` |
| **Infisical** | `infisical login` | `~/.infisical/` |
| **Supabase** | `supabase login` | `~/.supabase/` |
| **Vercel** | `vercel login` | `~/.local/share/com.vercel.cli/` |
| **Claude** | `claude auth login` | `~/.claude/` |
| **OCI** | Manual config | `~/.oci/config` |
| **Grafana** | Manual config | `~/.config/grafanactl/config.yaml` |

## Quick Setup (New Machine)

```powershell
# Windows - Run in PowerShell
gh auth login
az login
infisical login
supabase login
vercel login
claude auth login
```

```bash
# Mac/Linux - Run in Terminal
gh auth login
az login
infisical login
supabase login
vercel login
claude auth login
```

## Verify All CLIs

Run inside dev container:

```bash
bash instruction/skills/cli-onboarding/scripts/verify-clis.sh
```

## Manual Config Files

### OCI CLI (`~/.oci/config`)

```ini
[DEFAULT]
user=ocid1.user.oc1..your-user-ocid
fingerprint=your-key-fingerprint
tenancy=ocid1.tenancy.oc1..your-tenancy-ocid
region=ap-singapore-1
key_file=~/.oci/oci_api_key.pem
```

### Grafana CLI (`~/.config/grafanactl/config.yaml`)

```yaml
contexts:
  stocktracker:
    grafana:
      server: https://stockandcryptotracker.grafana.net
      token: glsa_your_service_account_token
current-context: stocktracker
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Command not found" | Rebuild dev container: `Ctrl+Shift+P` → "Rebuild Container" |
| "Not authenticated" | Run login command on **HOST**, then reopen container |
| "Permission denied" | Check if auth folder exists on host |
| "Mount failed" | Create empty folder on host: `mkdir -p ~/.config/gh` |
