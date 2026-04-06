#!/bin/bash
# ===========================================
# VM One-Time Setup Script
# ===========================================
# Run this script once to set up the VM for deployments
# Usage: sudo bash setup.sh
# ===========================================

set -e

echo "=========================================="
echo "Stock Tracker VM Setup"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo bash setup.sh"
    exit 1
fi

# ===========================================
# Install Infisical CLI
# ===========================================
echo ""
echo "=== Installing Infisical CLI ==="
if command -v infisical &> /dev/null; then
    echo "Infisical CLI already installed: $(infisical --version)"
else
    curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash
    apt-get update && apt-get install -y infisical
    echo "Infisical CLI installed: $(infisical --version)"
fi

# ===========================================
# Create Project Directory
# ===========================================
echo ""
echo "=== Creating project directory ==="
DEPLOY_PATH="/opt/stocktracker"

mkdir -p $DEPLOY_PATH/{logs,repo}
chown -R azureuser:azureuser $DEPLOY_PATH

echo "Created: $DEPLOY_PATH"
ls -la $DEPLOY_PATH

# ===========================================
# Install Docker (if not present)
# ===========================================
echo ""
echo "=== Checking Docker ==="
if command -v docker &> /dev/null; then
    echo "Docker already installed: $(docker --version)"
else
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | bash
    usermod -aG docker azureuser
    systemctl enable docker
    systemctl start docker
    echo "Docker installed: $(docker --version)"
fi

# ===========================================
# Install Docker Compose (if not present)
# ===========================================
echo ""
echo "=== Checking Docker Compose ==="
if command -v docker compose &> /dev/null; then
    echo "Docker Compose already installed: $(docker compose version)"
else
    echo "Docker Compose should be included with Docker. Please check installation."
fi

# ===========================================
# Install Systemd Boot Service
# ===========================================
echo ""
echo "=== Installing StockTracker boot service ==="
DEPLOY_PATH="/opt/stocktracker"
if [ -f "$DEPLOY_PATH/repo/deployment/vm/stocktracker.service" ]; then
    cp "$DEPLOY_PATH/repo/deployment/vm/stocktracker.service" /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable stocktracker.service
    echo "stocktracker.service installed and enabled"
else
    echo "WARNING: stocktracker.service not found in repo, skipping"
    echo "It will be installed on the next CI/CD deploy"
fi

# ===========================================
# Summary
# ===========================================
echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Create Machine Identity in Infisical Dashboard"
echo "   - Go to: Infisical → Access Control → Machine Identities"
echo "   - Create identity with access to 'production' environment"
echo ""
echo "2. Add GitHub Secrets:"
echo "   - VM_SSH_PRIVATE_KEY: Content of ~/.ssh/nx-linux-server-azure_key (1).pem"
echo "   - VM_INFISICAL_CLIENT_ID: From Machine Identity"
echo "   - VM_INFISICAL_CLIENT_SECRET: From Machine Identity"
echo ""
echo "3. Push code to trigger deployment"
echo ""
echo "=========================================="

