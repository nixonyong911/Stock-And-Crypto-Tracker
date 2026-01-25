#!/bin/bash
# ===========================================
# Start Frontend Staging with Infisical STAGING Secrets
# ===========================================
# This script is SEPARATE from start-services.sh to:
# 1. Not affect backend services (which use prod env)
# 2. Use Infisical STAGING environment for frontend
#
# Usage: ./start-frontend-staging.sh [--build]
# Example: ./start-frontend-staging.sh           # just start
#          ./start-frontend-staging.sh --build   # rebuild and start
# ===========================================

set -e

DEPLOY_PATH="/opt/stocktracker"
cd $DEPLOY_PATH

# Parse arguments
BUILD_FLAG=""
if [ "$1" == "--build" ]; then
    BUILD_FLAG="--build"
    echo "=== Build flag detected - will rebuild image ==="
fi

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
fi

echo "=== Starting frontend-staging with STAGING secrets ==="
# Use --env=staging (NOT prod!) for frontend staging
# NEXT_PUBLIC_* vars are injected as env vars and used as build args
infisical run --env=staging --projectId=$INFISICAL_PROJECT_ID --token=$TOKEN \
    -- docker compose up -d $BUILD_FLAG frontend-staging

echo "=== Frontend staging started ==="
docker ps --filter name=frontend-staging --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
