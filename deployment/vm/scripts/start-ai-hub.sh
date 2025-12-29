#!/bin/bash
# ===========================================
# Start AI Hub with Infisical Secret Injection
# ===========================================
# This script is called by the systemd service to start ai-hub
# with secrets injected from Infisical.
#
# PHASE 1 OPTIMIZATION: Uses venv for faster deployments
# Venv path: /opt/stocktracker/ai-hub-venv
# ===========================================

DEPLOY_PATH="/opt/stocktracker"
AI_HUB_VENV="$DEPLOY_PATH/ai-hub-venv"
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

# Check if venv exists
if [ ! -d "$AI_HUB_VENV" ]; then
    echo "ERROR: AI Hub venv not found at $AI_HUB_VENV"
    echo "Run deployment workflow to create the venv"
    exit 1
fi

# Run ai-hub with secrets injected (using venv python)
cd /opt/stocktracker/repo/services/ai/ai-hub
exec infisical run --env=prod --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN -- "$AI_HUB_VENV/bin/uvicorn" main:app --host 0.0.0.0 --port 8084
