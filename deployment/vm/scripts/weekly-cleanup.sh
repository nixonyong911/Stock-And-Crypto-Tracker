#!/bin/bash
# Weekly Docker and system cleanup script
# Logs sent to Grafana Cloud via Alloy, rotated automatically

set -e

LOG_FILE="/var/log/weekly-cleanup.log"
LOG_LAST="/var/log/weekly-cleanup.last"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Rotate: save previous log, start fresh
[ -f "$LOG_FILE" ] && mv "$LOG_FILE" "$LOG_LAST"

log() {
    echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

log "=== CLEANUP START ==="
log "Host: $(hostname)"

# Disk before
BEFORE=$(df / | awk 'NR==2 {print $3}')
log "Disk used before: ${BEFORE}KB"

# 1. Docker build cache (keep 2GB)
log "Pruning build cache (keeping 2GB)..."
CACHE_FREED=$(docker builder prune -f --keep-storage 2gb 2>&1 | grep -oP 'reclaimed \K[0-9.]+[KMGT]?B' || echo "0B")
log "Build cache freed: $CACHE_FREED"

# 2. Unused images older than 24h
log "Pruning images older than 24h..."
IMG_FREED=$(docker image prune -af --filter "until=24h" 2>&1 | grep -oP 'reclaimed \K[0-9.]+[KMGT]?B' || echo "0B")
log "Images freed: $IMG_FREED"

# 3. Stopped containers older than 24h
log "Pruning stopped containers..."
docker container prune -f --filter "until=24h" > /dev/null 2>&1

# 4. Journal logs (keep 100MB)
log "Vacuuming journal logs..."
sudo journalctl --vacuum-size=100M > /dev/null 2>&1

# 5. Apt cache
log "Cleaning apt cache..."
sudo apt-get clean -y > /dev/null 2>&1

# Disk after
AFTER=$(df / | awk 'NR==2 {print $3}')
SAVED=$(( (BEFORE - AFTER) / 1024 ))
log "Disk used after: ${AFTER}KB"
log "Total freed: ${SAVED}MB"
log "=== CLEANUP COMPLETE ==="











