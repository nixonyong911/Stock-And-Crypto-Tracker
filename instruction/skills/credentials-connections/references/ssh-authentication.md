# SSH Authentication

Complete guide for SSH access to the Azure VM hosting Stock Tracker services.

---

## VM Details

| Property | Value |
|----------|-------|
| **VM Name** | nx-linux-server-azure |
| **Size** | Standard_B2s |
| **Public IP** | 20.17.176.1 |
| **FQDN** | nxserver.malaysiawest.cloudapp.azure.com |
| **Region** | Malaysia West |
| **OS** | Ubuntu 24.04 LTS |
| **SSH User** | azureuser |

---

## SSH Key Path (CRITICAL)

The SSH key filename contains spaces and parentheses: `nx-linux-server-azure_key (1).pem`

### Windows

```powershell
"$HOME\.ssh\nx-linux-server-azure_key (1).pem"
```

**MUST use double quotes** - the spaces require quoting.

### Linux/Mac

```bash
~/.ssh/nx-linux-server-azure_key\ \(1\).pem
```

**MUST escape parentheses** with backslashes.

### DO NOT Rename the Key

The key filename is referenced in:
- GitHub Secrets (`VM_SSH_PRIVATE_KEY`)
- PowerShell profile function (`ssh-azure`)
- Documentation

Renaming will break CI/CD and automation.

---

## Connection Methods

### Method 1: PowerShell Function (Interactive)

If `ssh-azure` is defined in your PowerShell profile:

```powershell
ssh-azure
```

**Function definition** (in `$HOME\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`):
```powershell
function ssh-azure {
    ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
}
```

### Method 2: Direct SSH (Preferred for Agents/Automation)

For non-interactive commands or when PowerShell profile isn't loaded:

```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
```

### Method 3: SSH with Remote Command (Best for AI Agents)

Execute a single command without starting an interactive session:

```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "<command>"
```

**Examples**:
```powershell
# Check Docker containers
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker ps"

# View logs
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "docker logs twelvedata --tail 50"

# Restart service
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && docker compose restart metrics"

# Deploy services
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "cd /opt/stocktracker && ./scripts/start-services.sh up -d"
```

**Why this method is preferred for agents**:
- No interactive session required
- Faster execution
- Easier to capture output
- Better for automation

---

## Setup Guide

### Step 1: Locate SSH Key

The private key should be at:
- Windows: `C:\Users\<YourUsername>\.ssh\nx-linux-server-azure_key (1).pem`
- Linux/Mac: `~/.ssh/nx-linux-server-azure_key (1).pem`

### Step 2: Set Correct Permissions (Linux/Mac Only)

```bash
chmod 400 ~/.ssh/nx-linux-server-azure_key\ \(1\).pem
```

### Step 3: Test Connection

```powershell
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 "echo 'Connection successful'"
```

### Step 4: (Optional) Add PowerShell Function

Edit: `$HOME\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`

Add:
```powershell
function ssh-azure {
    ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
}
```

Reload profile:
```powershell
. $PROFILE
```

---

## Troubleshooting

### Permission Denied (publickey)

**Cause**: SSH key path not quoted correctly or wrong key.

**Solution**:
```powershell
# Ensure path is quoted
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1

# Verify key file exists
Test-Path "$HOME\.ssh\nx-linux-server-azure_key (1).pem"

# Check key permissions (Linux/Mac)
ls -l ~/.ssh/nx-linux-server-azure_key\ \(1\).pem
# Should be: -r-------- (400)
```

### Connection Refused

**Cause**: VM may be restarting or Azure networking issue.

**Solution**:
- Wait 1-2 minutes and retry
- Check VM status in Azure Portal
- Verify Network Security Group rules allow SSH (port 22)

### Host Key Verification Failed

**Cause**: VM was recreated or SSH host key changed.

**Solution**:
```powershell
# Remove old host key
ssh-keygen -R 20.17.176.1
ssh-keygen -R nxserver.malaysiawest.cloudapp.azure.com

# Reconnect (will prompt to accept new key)
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
```

### Bad Permissions (Linux/Mac)

**Cause**: SSH key file has overly permissive permissions.

**Solution**:
```bash
chmod 400 ~/.ssh/nx-linux-server-azure_key\ \(1\).pem
```

### SSH Hangs/Timeout

**Cause**: Network connectivity issue or firewall blocking SSH.

**Solution**:
```powershell
# Test with verbose output
ssh -v -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1

# Try using FQDN instead of IP
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@nxserver.malaysiawest.cloudapp.azure.com
```

---

## Advanced: SSH Config File (Optional)

Create `~/.ssh/config` (Linux/Mac) or `%USERPROFILE%\.ssh\config` (Windows):

```
Host nx-azure
    HostName 20.17.176.1
    User azureuser
    IdentityFile ~/.ssh/nx-linux-server-azure_key (1).pem
    StrictHostKeyChecking no
```

Then connect with:
```bash
ssh nx-azure
```

**Note**: This doesn't work well with spaces in the IdentityFile path on Windows. Direct command is more reliable.

---

## Related

- [Infrastructure Configuration](../../../reference/infrastructure-config.md) - Complete VM details
- [DevOps Tools](../../devops-tools/SKILL.md) - Commands to run on VM
