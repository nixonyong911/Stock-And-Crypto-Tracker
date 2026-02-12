#!/bin/bash
# ===========================================
# Apply Schedule Changes Script (Bash)
# ===========================================
# Run this directly on the VM after updating 
# schedule values in the database.
#
# Usage: ./apply-schedule-changes.sh
# ===========================================

set -e

DEPLOY_PATH="/opt/stocktracker"

echo "=== Worker Schedule Update ==="
echo ""

# Step 1: Restart workers
echo "[1/3] Restarting workers..."
cd "$DEPLOY_PATH"
docker compose restart twelvedata data-fetcher-2.0

# Step 2: Wait for workers to initialize
echo "[2/3] Waiting for workers to load schedules (15 seconds)..."
sleep 15

# Step 3: Verify new schedules
echo "[3/3] Verifying schedules..."
echo ""

echo "=== TwelveData Schedule ==="
docker logs twelvedata 2>&1 | grep "Schedule.*loaded" | tail -1

echo ""
echo "=== CandlestickAnalysis Schedule ==="
docker logs data-fetcher-2.0 2>&1 | grep "Candlestick.*Schedule.*loaded" | tail -1

echo ""
echo "=== Done ==="
echo "If schedules look correct, changes are applied!"
