#!/bin/bash
# ===========================================
# Start Services with Infisical Secret Injection
# ===========================================
# This script authenticates with Infisical using Machine Identity
# and starts docker compose with secrets injected at runtime.
#
# Usage: ./start-services.sh [docker-compose-args]
# Example: ./start-services.sh up -d
#          ./start-services.sh up -d --build data-fetcher-2.0
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

echo "=== Loading version variables ==="
# Load version variables if they exist (written by CI/CD)
if [ -f "$DEPLOY_PATH/.env.versions" ]; then
    export $(grep -v '^#' "$DEPLOY_PATH/.env.versions" | xargs)
    echo "Loaded versions from .env.versions"
    cat "$DEPLOY_PATH/.env.versions"
else
    echo "No .env.versions found, using :latest tags"
fi

echo "=== Starting services with secrets injected ==="

# Define backend services (excluding frontend-staging which uses STAGING env)
BACKEND_SERVICES="caddy n8n metrics alloy redis rabbitmq mcp-analysis gateway-2.0 back-office data-fetcher-2.0"

# Detect if this is a generic "up -d" call (no specific service)
# Frontend-staging must be started separately with start-frontend-staging.sh (uses STAGING secrets)
if [[ "$*" == "up -d" ]]; then
    echo "=== Running for backend services only (excluding frontend-staging) ==="
    infisical run --env=prod --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN -- docker compose up -d $BACKEND_SERVICES
elif [[ "$*" == "up -d --build" ]]; then
    echo "=== Rebuilding backend services only (excluding frontend-staging) ==="
    infisical run --env=prod --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN -- docker compose up -d --build $BACKEND_SERVICES
else
    # Specific service or other command - pass through as-is
    infisical run --env=prod --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN -- docker compose "$@"
fi

