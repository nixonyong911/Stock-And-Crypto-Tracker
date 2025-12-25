# TwelveData Worker Migration: Container Apps to Azure VM

**Date**: December 26, 2025  
**Status**: Planned (to be resumed)

## Problem Statement

The TwelveData worker deployed as an Azure Container App was not running because:

1. Azure Container Apps scales to **0 replicas** when there's no HTTP traffic
2. The worker is a background service that waits for a scheduled time (22:00 UTC)
3. With 0 replicas, the container never starts, so the schedule never triggers

### Evidence from Azure CLI

```
az containerapp revision list --name ca-twelvedata --resource-group rg-stocktracker -o table

Name                    Replicas    HealthState
----------------------  ----------  -----------
ca-twelvedata--0000001  0           Healthy      <-- 0 replicas!
```

### Evidence from Supabase

```sql
SELECT last_run_at, last_run_status FROM fetch_schedules WHERE name = 'TwelveData Daily Stocks';

last_run_at | last_run_status
------------|----------------
NULL        | NULL             <-- Never ran!
```

## Options Considered

### Option 1: Set minReplicas=1 (Rejected)
- Keep Container App always running with at least 1 replica
- **Cost**: ~$15-30/month
- **Rejected**: Wasteful - the worker only needs to run once per day

### Option 2: Azure Container Apps Job (Initially Planned)
- Convert from Container App to Container Apps Job with scheduled trigger
- Azure spins up container at cron time, runs, exits, scales to 0
- **Cost**: ~$0.50-1/month
- **Complexity**: Moderate - requires Azure CLI configuration, secrets management

### Option 3: Azure VM + Docker + Cron (Selected)
- Use existing Azure VM (`nx-linux-server-azure`) that runs 24/7
- Run TwelveData as Docker container triggered by Linux cron at 22:00 UTC
- **Cost**: $0 (VM already running for other services)
- **Complexity**: Simple - just cron + docker run

## Selected Approach: VM + Docker + Cron

### Why This Approach

| Factor | VM + Cron | Container Apps Job |
|--------|-----------|-------------------|
| Cost | **Free** (VM exists) | ~$0.50-1/month |
| Setup | Simple | Moderate |
| Maintenance | Manual | Azure managed |
| Reliability | VM uptime | Azure SLA |

Since the VM is already running 24/7 for other purposes, using it for the TwelveData worker is essentially free and simpler to set up.

### VM Details

| Property | Value |
|----------|-------|
| Name | nx-linux-server-azure |
| Resource Group | NIXON-CITY |
| Size | Standard_B2s (2 vCPU, 4GB RAM) |
| Location | Malaysia West |
| Public IP | 20.17.176.1 |
| Auto-shutdown | Not configured (runs 24/7) |
| Docker | Installed |

## Code Changes Made

### Program.cs Updated

The TwelveData worker's `Program.cs` was modified to support **dual mode**:

1. **Job Mode** (`RUN_AS_JOB=true`): Runs once and exits
2. **Service Mode** (default): Runs as web API with background worker

```csharp
// Check if running as a scheduled job
var runAsJob = Environment.GetEnvironmentVariable("RUN_AS_JOB")?.ToLower() == "true";

if (runAsJob)
{
    // JOB MODE: Run once and exit
    await RunAsJobAsync(args);
}
else
{
    // SERVICE MODE: Run as web API (for local dev/testing)
    await RunAsServiceAsync(args);
}
```

File: `services/data-fetchers/TwelveData/src/TwelveData.Worker/Program.cs`

## Implementation Plan (To Resume)

### Prerequisites
- [ ] Push the updated Program.cs changes to main branch
- [ ] Build and push new Docker image to ACR

### VM Setup Steps

1. **SSH to VM**
   ```bash
   ssh <user>@20.17.176.1
   ```

2. **Login to Azure Container Registry**
   ```bash
   docker login acrstocktracker911.azurecr.io -u acrstocktracker911 -p "<password>"
   ```

3. **Pull Docker Image**
   ```bash
   docker pull acrstocktracker911.azurecr.io/twelvedata-worker:latest
   ```

4. **Create Environment File** at `/opt/stocktracker/.env`:
   ```env
   RUN_AS_JOB=true
   ASPNETCORE_ENVIRONMENT=Production
   ConnectionStrings__DefaultConnection=<from .env.staging>
   TwelveData__ApiKey=<from .env.staging>
   TwelveData__BaseUrl=https://api.twelvedata.com
   ```

5. **Create Run Script** at `/opt/stocktracker/run-twelvedata.sh`:
   ```bash
   #!/bin/bash
   LOG_FILE="/opt/stocktracker/logs/twelvedata-$(date +%Y%m%d-%H%M%S).log"
   mkdir -p /opt/stocktracker/logs

   echo "Starting TwelveData fetch at $(date)" >> "$LOG_FILE"

   docker pull acrstocktracker911.azurecr.io/twelvedata-worker:latest >> "$LOG_FILE" 2>&1

   docker run --rm \
     --env-file /opt/stocktracker/.env \
     acrstocktracker911.azurecr.io/twelvedata-worker:latest \
     >> "$LOG_FILE" 2>&1

   EXIT_CODE=$?
   echo "Completed at $(date) with exit code $EXIT_CODE" >> "$LOG_FILE"

   # Cleanup old logs
   find /opt/stocktracker/logs -name "*.log" -mtime +30 -delete
   ```

6. **Set Up Cron Job** (22:00 UTC daily):
   ```bash
   sudo crontab -e
   # Add: 0 22 * * * /opt/stocktracker/run-twelvedata.sh
   ```

7. **Test Manually**
   ```bash
   sudo /opt/stocktracker/run-twelvedata.sh
   ```

8. **Verify in Supabase**
   ```sql
   SELECT last_run_at, last_run_status FROM fetch_schedules;
   ```

### Optional Cleanup

After verifying the VM setup works:
```powershell
az containerapp delete --name ca-twelvedata --resource-group rg-stocktracker --yes
```

## Azure Resources Reference

### Container Registry (ACR)
- **Name**: acrstocktracker911
- **Server**: acrstocktracker911.azurecr.io
- **Username**: acrstocktracker911

### Container Apps Environment
- **Name**: cae-stocktracker
- **Resource Group**: rg-stocktracker
- **Location**: Southeast Asia

### Remaining Container Apps (may have same 0-replica issue)
- ca-alphavantage
- ca-metrics

## Related Files

- `services/data-fetchers/TwelveData/src/TwelveData.Worker/Program.cs` - Job mode support
- `services/data-fetchers/TwelveData/Dockerfile` - Docker build config
- `.github/workflows/deploy-azure.yml` - CI/CD pipeline
- `.env.staging` - Secrets (not committed)

## Notes

- The `ca-alphavantage` Container App likely has the same 0-replica issue
- Consider migrating AlphaVantage worker to VM as well in the future
- The schedule time (22:00 UTC) is after US market close - ideal for fetching daily data

