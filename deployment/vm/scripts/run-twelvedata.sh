#!/bin/bash
# ===========================================
# TwelveData Scheduled Fetch Script
# ===========================================
# Called by cron at 22:00 UTC Mon-Fri
# Crontab entry: 0 22 * * 1-5 /opt/stocktracker/scripts/run-twelvedata.sh
# ===========================================

DEPLOY_PATH="/opt/stocktracker"
LOG_DIR="$DEPLOY_PATH/logs"
LOG_FILE="$LOG_DIR/twelvedata-cron-$(date +%Y%m%d).log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Log start
echo "=========================================" >> "$LOG_FILE"
echo "TwelveData Scheduled Fetch" >> "$LOG_FILE"
echo "Started: $(date)" >> "$LOG_FILE"
echo "=========================================" >> "$LOG_FILE"

# Trigger fetch via API
echo "Triggering fetch..." >> "$LOG_FILE"
docker exec twelvedata curl -s -X POST http://localhost:8080/api/fetch/trigger/all >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

# Log result
echo "" >> "$LOG_FILE"
echo "Exit code: $EXIT_CODE" >> "$LOG_FILE"
echo "Completed: $(date)" >> "$LOG_FILE"
echo "=========================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Cleanup old logs (keep 30 days)
find "$LOG_DIR" -name "twelvedata-cron-*.log" -mtime +30 -delete

exit $EXIT_CODE

