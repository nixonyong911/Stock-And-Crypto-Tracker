#!/bin/bash
# ===========================================
# Start AI Hub with Infisical Secret Injection
# ===========================================
# This script is called by the systemd service to start ai-hub
# with secrets injected from Infisical.
# ===========================================

DEPLOY_PATH="/opt/stocktracker"
cd $DEPLOY_PATH

# Load Infisical auth
source config/infisical-auth.sh

# Get token
TOKEN=$(infisical login --method=universal-auth \
    --client-id=$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID \
    --client-secret=$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET \
    --plain 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to authenticate with Infisical"
    exit 1
fi

# Run ai-hub with secrets injected
cd /opt/stocktracker/repo/services/ai/ai-hub
exec infisical run --env=prod --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN -- /home/azureuser/.local/bin/uvicorn main:app --host 0.0.0.0 --port 8084

