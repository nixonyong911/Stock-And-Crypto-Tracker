#!/bin/bash
# ===========================================
# CLI Verification Script
# Run inside dev container to check all CLIs
# ===========================================

echo "=========================================="
echo "CLI Verification - Stock Tracker"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_cli() {
    local name=$1
    local cmd=$2
    local auth_check=$3

    if command -v $cmd &> /dev/null; then
        version=$($cmd --version 2>/dev/null | head -1 || echo "installed")
        if [ -n "$auth_check" ]; then
            if eval "$auth_check" &>/dev/null; then
                echo -e "${GREEN}✓${NC} $name: $version (authenticated)"
            else
                echo -e "${YELLOW}⚠${NC} $name: $version (NOT authenticated)"
            fi
        else
            echo -e "${GREEN}✓${NC} $name: $version"
        fi
    else
        echo -e "${RED}✗${NC} $name: not installed"
    fi
}

echo "=== Runtimes ==="
check_cli "Node.js" "node" ""
check_cli "npm" "npm" ""
check_cli ".NET" "dotnet" ""
check_cli "Go" "go" ""
check_cli "Python" "python3" ""

echo ""
echo "=== CLIs with Auth ==="
check_cli "GitHub CLI" "gh" "gh auth status"
check_cli "Azure CLI" "az" "az account show"
check_cli "Infisical" "infisical" "infisical whoami"
check_cli "Supabase" "supabase" ""
check_cli "Vercel" "vercel" "vercel whoami"
check_cli "Claude" "claude" ""
check_cli "OCI" "oci" "oci iam region list"

echo ""
echo "=== Infrastructure ==="
check_cli "Docker" "docker" "docker info"
check_cli "Docker Compose" "docker-compose" ""

echo ""
echo "=== Dev Tools ==="
check_cli "TypeScript" "tsc" ""
check_cli "pnpm" "pnpm" ""
check_cli "yarn" "yarn" ""

echo ""
echo "=========================================="
echo "Verification complete!"
echo ""
echo "If any CLI shows 'NOT authenticated':"
echo "  1. Exit dev container (Reopen Folder Locally)"
echo "  2. Run the login command on your host machine"
echo "  3. Reopen in dev container"
echo "=========================================="
