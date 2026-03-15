#!/bin/bash
# ===========================================
# PostgreSQL Daily Backup Script
# ===========================================
# Produces two dumps inside the postgres container:
#   1. Full DB dump (disaster recovery)
#   2. Public-schema-only dump (for Supabase mirror)
# Keeps last 7 daily backups of each type.
#
# Install: add to crontab on VM host
#   0 3 * * * /opt/stocktracker/scripts/backup-postgres.sh >> /var/log/stocktracker/backup.log 2>&1
# ===========================================

set -euo pipefail

CONTAINER="postgres"
BACKUP_DIR="/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FULL_DUMP="stocktracker_full_${TIMESTAMP}.custom"
PUBLIC_DUMP="stocktracker_public_${TIMESTAMP}.custom"

echo "[$(date)] Starting PostgreSQL backup..."

echo "[$(date)] Creating full database dump..."
docker exec "${CONTAINER}" pg_dump \
  -U postgres \
  -d stocktracker \
  --format=custom \
  --compress=6 \
  -f "${BACKUP_DIR}/${FULL_DUMP}"
echo "[$(date)] Full dump created: ${FULL_DUMP}"

echo "[$(date)] Creating public-schema dump (for Supabase mirror)..."
docker exec "${CONTAINER}" pg_dump \
  -U postgres \
  -d stocktracker \
  --schema=public \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  -f "${BACKUP_DIR}/${PUBLIC_DUMP}"
echo "[$(date)] Public dump created: ${PUBLIC_DUMP}"

docker exec "${CONTAINER}" find "${BACKUP_DIR}" -name "stocktracker_full_*.custom" -mtime +${RETENTION_DAYS} -delete
docker exec "${CONTAINER}" find "${BACKUP_DIR}" -name "stocktracker_public_*.custom" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETENTION_DAYS} days"

FULL_COUNT=$(docker exec "${CONTAINER}" ls -1 "${BACKUP_DIR}"/stocktracker_full_*.custom 2>/dev/null | wc -l)
PUBLIC_COUNT=$(docker exec "${CONTAINER}" ls -1 "${BACKUP_DIR}"/stocktracker_public_*.custom 2>/dev/null | wc -l)
echo "[$(date)] Backups on disk: ${FULL_COUNT} full, ${PUBLIC_COUNT} public"
