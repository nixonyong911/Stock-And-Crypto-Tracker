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

# 6. Truncate oversized Docker container logs (>100MB)
log "Checking Docker container log sizes..."
for LOG_PATH in /var/lib/docker/containers/*/*-json.log; do
    if [ -f "$LOG_PATH" ]; then
        SIZE=$(stat -c%s "$LOG_PATH" 2>/dev/null || echo 0)
        if [ "$SIZE" -gt 104857600 ]; then
            log "Truncating $(basename $(dirname $LOG_PATH)): $(( SIZE / 1048576 ))MB"
            truncate -s 0 "$LOG_PATH"
        fi
    fi
done

# 7. Reap zombie processes (kill parents spawning >5 zombies)
log "Checking for zombie processes..."
ZOMBIE_COUNT=$(ps -eo stat | grep -c '^Z' || echo 0)
log "Zombie count: $ZOMBIE_COUNT"
if [ "$ZOMBIE_COUNT" -gt 5 ]; then
    log "Reaping zombie parent processes..."
    ps -eo pid,ppid,stat,cmd | awk '$3 ~ /Z/ {print $2}' | sort | uniq -c | sort -rn | while read count ppid; do
        if [ "$count" -gt 5 ] && [ "$ppid" != "1" ]; then
            PARENT_CMD=$(ps -p "$ppid" -o cmd --no-headers 2>/dev/null || echo "unknown")
            log "Killing parent PID $ppid ($count zombies): $PARENT_CMD"
            kill -9 "$ppid" 2>/dev/null || true
        fi
    done
fi

# 8. Memory usage check
MEM_PCT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')
log "Memory usage: ${MEM_PCT}%"
if [ "$MEM_PCT" -gt 85 ]; then
    log "WARNING: Memory usage above 85% - consider investigating"
fi

# Disk after
AFTER=$(df / | awk 'NR==2 {print $3}')
SAVED=$(( (BEFORE - AFTER) / 1024 ))
log "Disk used after: ${AFTER}KB"
log "Total freed: ${SAVED}MB"
log "=== CLEANUP COMPLETE ==="












