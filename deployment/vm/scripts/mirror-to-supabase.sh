#!/bin/bash
# ===========================================
# Mirror VM PostgreSQL to Supabase (Daily)
# ===========================================
# Restores the latest public-schema dump to Supabase as a backup mirror.
# All pg_restore/psql commands run inside the Docker postgres container
# to ensure v17 tool compatibility.
#
# Safeguards:
#   - Only touches public schema (Supabase internals untouched)
#   - --no-owner --no-acl (skip role/permission mismatches)
#   - Disables all user triggers after restore (Docker-internal URLs)
#   - Row count verification for key tables
#   - Telegram notification on success/failure
#   - 3 retries with exponential backoff
#
# Prerequisites:
#   - /opt/stocktracker/.env.mirror with SUPABASE_MIRROR_URL
#   - backup-postgres.sh must have run first (creates _public_ dumps)
#
# Install: add to crontab on VM host
#   0 4 * * * /opt/stocktracker/scripts/mirror-to-supabase.sh >> /var/log/stocktracker/mirror.log 2>&1
# ===========================================

set -euo pipefail

CONTAINER="postgres"
BACKUP_DIR="/backups"
ENV_FILE="/opt/stocktracker/.env.mirror"
MAX_RETRIES=3
VERIFY_TABLES="users stock_tickers stock_prices"

log() { echo "[$(date)] $1"; }

send_telegram() {
  local message="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ERROR_CHAT_ID:-}" ]; then
    curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="${TELEGRAM_ERROR_CHAT_ID}" \
      -d text="${message}" \
      -d parse_mode="HTML" > /dev/null 2>&1 || true
  fi
}

trap 'log "ERROR: Script terminated unexpectedly at line $LINENO"; send_telegram "🔴 <b>Mirror Failed</b>: Unexpected error at line $LINENO"' ERR

if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

if [ -z "${SUPABASE_MIRROR_URL:-}" ]; then
  log "ERROR: SUPABASE_MIRROR_URL not set. Create ${ENV_FILE} with: SUPABASE_MIRROR_URL=postgresql://..."
  send_telegram "🔴 <b>Mirror Failed</b>: SUPABASE_MIRROR_URL not configured"
  exit 1
fi

DUMP_FILE=$(docker exec "${CONTAINER}" sh -c "ls -1t ${BACKUP_DIR}/stocktracker_public_*.custom 2>/dev/null | head -1")

if [ -z "${DUMP_FILE}" ]; then
  log "No public dump found. Running backup first..."
  /opt/stocktracker/scripts/backup-postgres.sh
  DUMP_FILE=$(docker exec "${CONTAINER}" sh -c "ls -1t ${BACKUP_DIR}/stocktracker_public_*.custom 2>/dev/null | head -1")
fi

if [ -z "${DUMP_FILE}" ]; then
  log "ERROR: No dump file available after backup attempt"
  send_telegram "🔴 <b>Mirror Failed</b>: No dump file available"
  exit 1
fi

log "Using dump: ${DUMP_FILE}"

restore_to_supabase() {
  local output
  output=$(docker exec "${CONTAINER}" pg_restore \
    --schema=public \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    -d "${SUPABASE_MIRROR_URL}" \
    "${DUMP_FILE}" 2>&1) || true

  echo "$output"

  # Fail on hard connectivity errors; tolerate non-fatal pg_restore warnings
  # (e.g. "does not exist, skipping", "already exists") which are expected.
  if echo "$output" | grep -qiE "connection.*failed|Network is unreachable|could not connect|timeout expired|SSL SYSCALL"; then
    log "ERROR: Supabase connection failed"
    return 1
  fi
  return 0
}

RESTORE_OK=false
for attempt in $(seq 1 $MAX_RETRIES); do
  log "Restore attempt ${attempt}/${MAX_RETRIES}..."

  if restore_to_supabase; then
    RESTORE_OK=true
    log "Restore succeeded on attempt ${attempt}"
    break
  else
    log "Restore attempt ${attempt} failed"
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      WAIT=$((attempt * 30))
      log "Waiting ${WAIT}s before retry..."
      sleep "$WAIT"
    fi
  fi
done

if [ "$RESTORE_OK" != "true" ]; then
  log "ERROR: All ${MAX_RETRIES} restore attempts failed"
  send_telegram "🔴 <b>Mirror Failed</b>: pg_restore failed after ${MAX_RETRIES} attempts"
  exit 1
fi

log "Disabling user triggers on Supabase..."
docker exec "${CONTAINER}" psql "${SUPABASE_MIRROR_URL}" -c "
DO \$\$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tgname, tgrelid::regclass::text AS tbl
           FROM pg_trigger WHERE NOT tgisinternal
           AND tgrelid::regclass::text NOT LIKE 'storage.%'
           AND tgrelid::regclass::text NOT LIKE 'auth.%'
           AND tgrelid::regclass::text NOT LIKE 'realtime.%'
  LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', r.tbl, r.tgname);
  END LOOP;
END \$\$;
" 2>&1
log "Triggers disabled"

log "Verifying row counts..."
MISMATCH=false
REPORT=""
for table in $VERIFY_TABLES; do
  VM_COUNT=$(docker exec "${CONTAINER}" psql -U postgres -d stocktracker -tAc "SELECT count(*) FROM public.${table};")
  SB_COUNT=$(docker exec "${CONTAINER}" psql "${SUPABASE_MIRROR_URL}" -tAc "SELECT count(*) FROM public.${table};")
  STATUS="OK"
  if [ "$VM_COUNT" != "$SB_COUNT" ]; then
    STATUS="MISMATCH"
    MISMATCH=true
  fi
  log "  ${table}: VM=${VM_COUNT} Supabase=${SB_COUNT} [${STATUS}]"
  REPORT="${REPORT}\n  ${table}: VM=${VM_COUNT} SB=${SB_COUNT}"
done

DUMP_NAME=$(basename "${DUMP_FILE}")
if [ "$MISMATCH" = "true" ]; then
  log "WARNING: Row count mismatches detected"
  send_telegram "🟡 <b>Mirror Completed with Warnings</b>\nDump: ${DUMP_NAME}\nRow count mismatches:${REPORT}"
else
  log "All row counts match"
  send_telegram "🟢 <b>Mirror Completed</b>\nDump: ${DUMP_NAME}\nAll row counts match:${REPORT}"
fi

log "Mirror complete"
