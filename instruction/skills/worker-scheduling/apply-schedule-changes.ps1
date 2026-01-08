# ===========================================
# Apply Schedule Changes Script (PowerShell)
# ===========================================
# Run this from your local Windows machine after 
# updating schedule values in the database.
#
# Usage: .\apply-schedule-changes.ps1
# ===========================================

$SSH_KEY = "$HOME\.ssh\nx-linux-server-azure_key (1).pem"
$VM_HOST = "azureuser@20.17.176.1"

Write-Host "=== Worker Schedule Update ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Restart workers
Write-Host "[1/3] Restarting workers..." -ForegroundColor Yellow
ssh -i $SSH_KEY $VM_HOST "cd /opt/stocktracker && docker compose restart twelvedata candlestick-analysis"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to restart workers" -ForegroundColor Red
    exit 1
}

# Step 2: Wait for workers to initialize
Write-Host "[2/3] Waiting for workers to load schedules (15 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Step 3: Verify new schedules
Write-Host "[3/3] Verifying schedules..." -ForegroundColor Yellow
Write-Host ""

Write-Host "=== TwelveData Schedule ===" -ForegroundColor Green
ssh -i $SSH_KEY $VM_HOST "docker logs twelvedata 2>&1 | grep 'Schedule.*loaded' | tail -1"

Write-Host ""
Write-Host "=== CandlestickAnalysis Schedule ===" -ForegroundColor Green
ssh -i $SSH_KEY $VM_HOST "docker logs candlestick-analysis 2>&1 | grep 'Schedule.*loaded' | tail -1"

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "If schedules look correct, changes are applied!"
Write-Host "If not, check the database values and run this script again."
