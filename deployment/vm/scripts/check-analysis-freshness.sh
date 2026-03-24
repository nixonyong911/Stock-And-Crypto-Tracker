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

IMAGE_NAME="stocktracker-freshness-check:latest"
NETWORK="stocktracker_stocktracker"
PG_CONTAINER="postgres"
FETCHER_CONTAINER="data-fetcher-2.0"
GATEWAY_CONTAINER="gateway-2.0"
MIRROR_ENV="/opt/stocktracker/.env.mirror"

log() { echo "[$(date)] $1"; }

# Telegram creds from .env.mirror (same as mirror-to-supabase.sh)
if [ -f "$MIRROR_ENV" ]; then
  source "$MIRROR_ENV"
fi

# Postgres password from the running postgres container
POSTGRES_PASSWORD=$(docker inspect "${PG_CONTAINER}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep '^POSTGRES_PASSWORD=' | head -1 | cut -d= -f2-)

# Alpaca keys from the running data-fetcher container
ALPACA_API_KEY_ID=$(docker inspect "${FETCHER_CONTAINER}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep '^Providers__Alpaca__ApiKeyId=' | head -1 | cut -d= -f2-)
ALPACA_API_SECRET_KEY=$(docker inspect "${FETCHER_CONTAINER}" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep '^Providers__Alpaca__ApiSecretKey=' | head -1 | cut -d= -f2-)

for var in POSTGRES_PASSWORD TELEGRAM_BOT_TOKEN TELEGRAM_ERROR_CHAT_ID; do
  if [ -z "${!var:-}" ]; then
    log "WARNING: ${var} not set"
  fi
done

log "Starting freshness check..."

docker run --rm \
  --network "${NETWORK}" \
  -e DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD:-}@${PG_CONTAINER}:5432/stocktracker" \
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
