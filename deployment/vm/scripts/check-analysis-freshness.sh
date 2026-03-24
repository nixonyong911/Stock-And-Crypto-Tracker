#!/bin/bash
# ===========================================
# Analysis Table Freshness Check (Twice Daily)
# ===========================================
# Checks all analysis tables for data freshness and sends a Telegram
# notification. Runs as a Docker container on the stocktracker network.
#
# Features:
#   - Per-table thresholds (30min, daily, weekly, 6h cycles)
#   - Alpaca API for NYSE market calendar (holidays + weekends)
#   - Crypto tables checked 24/7
#   - Stock tables skipped on market-closed days
#   - Only stale tables reported (silent when all OK — green summary)
#
# Install: add to crontab on VM host
#   0 0,12 * * * /opt/stocktracker/scripts/check-analysis-freshness.sh >> /var/log/stocktracker/freshness.log 2>&1
# ===========================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="/opt/stocktracker/.env"
IMAGE_NAME="stocktracker-freshness-check:latest"
NETWORK="stocktracker_stocktracker"
CONTAINER="postgres"

log() { echo "[$(date)] $1"; }

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

for var in POSTGRES_PASSWORD TELEGRAM_BOT_TOKEN TELEGRAM_ERROR_CHAT_ID; do
  if [ -z "${!var:-}" ]; then
    log "WARNING: ${var} not set"
  fi
done

log "Starting freshness check..."

docker run --rm \
  --network "${NETWORK}" \
  -e DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD:-}@${CONTAINER}:5432/stocktracker" \
  -e ALPACA_API_KEY_ID="${ALPACA_API_KEY_ID:-}" \
  -e ALPACA_API_SECRET_KEY="${ALPACA_API_SECRET_KEY:-}" \
  -e TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" \
  -e TELEGRAM_ERROR_CHAT_ID="${TELEGRAM_ERROR_CHAT_ID:-}" \
  "${IMAGE_NAME}"

EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
  log "Freshness check complete — all tables OK"
elif [ "$EXIT_CODE" -eq 1 ]; then
  log "Freshness check complete — stale tables detected"
else
  log "ERROR: Freshness check failed with exit code ${EXIT_CODE}"
fi

exit $EXIT_CODE
