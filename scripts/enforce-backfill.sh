#!/bin/bash
# One-off script to backfill all existing tickers missing indicator data.
# Calls the data-fetcher-2.0 backfill enforcement endpoint.

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:5001/api}"
VM_KEY="${VM_KEY:-$HOME/.ssh/nx-linux-server-azure_key.pem}"
VM_HOST="${VM_HOST:-azureuser@20.17.176.1}"

echo "=== Indicator Backfill Enforcement ==="
echo "API: $API_BASE"
echo ""

echo "Triggering backfill enforcement for all tickers..."
RESULT=$(curl -s -X POST "$API_BASE/backfill/enforce-all" -H "Content-Type: application/json")

echo "$RESULT" | jq .

TRIGGERED=$(echo "$RESULT" | jq '.triggered // 0')
FAILED=$(echo "$RESULT" | jq '.failed // 0')

echo ""
echo "=== Summary ==="
echo "Triggered: $TRIGGERED"
echo "Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
    echo "WARNING: Some backfills failed. Check details above."
    exit 1
fi

echo "Done."
