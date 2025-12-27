#!/bin/bash
# ===========================================
# Start Services with Infisical Secret Injection
# ===========================================
# This script authenticates with Infisical using Machine Identity
# and starts docker compose with secrets injected at runtime.
#
# Usage: ./start-services.sh [docker-compose-args]
# Example: ./start-services.sh up -d
#          ./start-services.sh up -d --build twelvedata
# ===========================================

set -e

DEPLOY_PATH="/opt/stocktracker"
cd $DEPLOY_PATH

# Load Infisical Machine Identity credentials
if [ ! -f "config/infisical-auth.sh" ]; then
    echo "ERROR: Infisical auth config not found at $DEPLOY_PATH/config/infisical-auth.sh"
    exit 1
fi
source config/infisical-auth.sh

# Authenticate with Infisical and get access token
echo "=== Authenticating with Infisical ==="
TOKEN=$(infisical login --method=universal-auth \
    --client-id=$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID \
    --client-secret=$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET \
    --plain 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to authenticate with Infisical"
    exit 1
fi

echo "=== Starting services with secrets injected ==="
# Run docker compose with secrets injected from Infisical
infisical run --env=prod --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN -- docker compose "$@"

