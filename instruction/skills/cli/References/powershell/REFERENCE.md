# PowerShell CLI Skill

## Overview

Custom functions defined in `$HOME\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`.

---

## ssh-azure

SSH into the Azure VM (nx-linux-server-azure).

```powershell
function ssh-azure { ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 }
```

**Usage:**

```powershell
ssh-azure
```

**VM Details:**

| Property | Value |
|----------|-------|
| VM Name | nx-linux-server-azure |
| Size | Standard_B2s |
| IP | 20.17.176.1 |
| FQDN | nxserver.malaysiawest.cloudapp.azure.com |
| User | azureuser |
| Key | `~\.ssh\nx-linux-server-azure_key (1).pem` |

> **📚 Infrastructure Reference**: See [Infrastructure Configuration](../../../reference/infrastructure-config.md) for comprehensive VM and service configuration.

---

## cursor-agent

Run cursor-agent via WSL Ubuntu.

```powershell
function cursor-agent { wsl -d Ubuntu -- bash -lc '~/.local/bin/cursor-agent $args' }
```

**Usage:**

```powershell
cursor-agent
```

---

## Direct SSH Commands (Without Function)

For AI agents, use direct SSH with command argument:

```powershell
# Direct SSH command format
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "<command>"

# Examples:
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps"
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata --tail 50"
```

---

## Related

- [vm-operations](../../../rules/vm-operations.md) - VM operations reference
- [docker](../docker/REFERENCE.md) - Docker commands

