#!/bin/bash
# ===========================================
# AI Hub Setup Script
# ===========================================
# Sets up ai-hub to run directly on the VM host.
# Run once after cloning the repo.
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/app"
AI_HUB_DIR="$APP_DIR/repo/services/ai/ai-hub"

echo "=== AI Hub Setup ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (sudo ./setup-ai-hub.sh)"
    exit 1
fi

# 1. Install Python dependencies
echo "Installing Python dependencies..."
if command -v pip3 &> /dev/null; then
    sudo -u azureuser pip3 install --user -r "$AI_HUB_DIR/requirements.txt"
else
    echo "Error: pip3 not found. Install Python 3 first."
    exit 1
fi

# 2. Create context directory
echo "Creating context directory..."
mkdir -p /mnt/stock-tracker/{agents,skills,context,instruction}
chown -R azureuser:azureuser /mnt/stock-tracker

# 3. Install systemd service
echo "Installing systemd service..."
cp "$SCRIPT_DIR/ai-hub.service" /etc/systemd/system/ai-hub.service

# 4. Create environment file (if not exists)
if [ ! -f /etc/ai-hub.env ]; then
    echo "Creating default environment file..."
    cat > /etc/ai-hub.env << 'EOF'
# AI Hub Environment Configuration
# ===========================================
# This file is loaded by systemd service.
# Secrets injected by Infisical at runtime.
# ===========================================

# CLI Prefix (empty for direct execution on host)
AI_HUB_CLI_PREFIX=

# Context path
AI_HUB_DEFAULT_CONTEXT_PATH=/mnt/stock-tracker

# Database (injected by Infisical)
# DATABASE_URL=
EOF
    chmod 600 /etc/ai-hub.env
    chown root:root /etc/ai-hub.env
fi

# 5. Reload systemd and enable service
echo "Enabling systemd service..."
systemctl daemon-reload
systemctl enable ai-hub

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start the service:"
echo "  sudo systemctl start ai-hub"
echo ""
echo "Check status:"
echo "  sudo systemctl status ai-hub"
echo "  journalctl -u ai-hub -f"
echo ""
echo "Test endpoint:"
echo "  curl http://localhost:8084/health/live"
echo ""

