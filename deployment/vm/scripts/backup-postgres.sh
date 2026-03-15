#!/bin/bash
# ===========================================
# PostgreSQL Daily Backup Script
# ===========================================
# Runs pg_dump inside the postgres container
# Keeps last 7 daily backups
# Install: add to crontab on VM host
#   0 3 * * * /opt/stocktracker/scripts/backup-postgres.sh
# ===========================================

set -euo pipefail

CONTAINER="postgres"
BACKUP_DIR="/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="stocktracker_${TIMESTAMP}.custom"

echo "[$(date)] Starting PostgreSQL backup..."

docker exec "${CONTAINER}" pg_dump \
  -U postgres \
  -d stocktracker \
  --format=custom \
  --compress=6 \
  -f "${BACKUP_DIR}/${DUMP_FILE}"

if [ $? -eq 0 ]; then
  echo "[$(date)] Backup created: ${DUMP_FILE}"

  docker exec "${CONTAINER}" find "${BACKUP_DIR}" -name "stocktracker_*.custom" -mtime +${RETENTION_DAYS} -delete
  echo "[$(date)] Cleaned backups older than ${RETENTION_DAYS} days"

  BACKUP_COUNT=$(docker exec "${CONTAINER}" ls -1 "${BACKUP_DIR}"/stocktracker_*.custom 2>/dev/null | wc -l)
  echo "[$(date)] Total backups: ${BACKUP_COUNT}"
else
  echo "[$(date)] ERROR: Backup failed!" >&2
  exit 1
fi
