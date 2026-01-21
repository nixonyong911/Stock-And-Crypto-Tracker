#!/bin/bash
# ===========================================
# Post-Start Script
# Runs EVERY TIME the dev container starts
# ===========================================

echo "=========================================="
echo "Stock Tracker Dev Container - Starting"
echo "=========================================="

# Check auth status (non-blocking)
echo ""
echo "Auth Status Check:"
echo "------------------"

# GitHub
if gh auth status &>/dev/null; then
    echo "✓ GitHub CLI: authenticated"
else
    echo "✗ GitHub CLI: not authenticated (run 'gh auth login' on host)"
fi

# Azure
if az account show &>/dev/null; then
    echo "✓ Azure CLI: authenticated"
else
    echo "✗ Azure CLI: not authenticated (run 'az login' on host)"
fi

# Infisical
if infisical whoami &>/dev/null; then
    echo "✓ Infisical: authenticated"
else
    echo "✗ Infisical: not authenticated (run 'infisical login' on host)"
fi

# Docker
if docker info &>/dev/null; then
    echo "✓ Docker: connected"
else
    echo "✗ Docker: not connected (check Docker Desktop)"
fi

echo ""
echo "=========================================="
echo "Dev container ready!"
echo ""
echo "Quick commands:"
echo "  infisical run --env=prod -- npm run dev"
echo "  docker-compose -f deployment/vm/docker-compose.yml up -d"
echo "=========================================="
