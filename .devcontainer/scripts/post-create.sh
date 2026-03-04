#!/bin/bash
# ===========================================
# Post-Create Script
# Runs ONCE after the dev container is created
# ===========================================

set -e

echo "=========================================="
echo "Stock Tracker Dev Container - Post Create"
echo "=========================================="

# Create auth directories if they don't exist (for first-time setup)
mkdir -p /root/.config/gh
mkdir -p /root/.azure
mkdir -p /root/.claude
mkdir -p /root/.cursor
mkdir -p /root/.config/cursor
mkdir -p /root/.infisical
mkdir -p /root/.oci
mkdir -p /root/.config/grafanactl
mkdir -p /root/.local/share/com.vercel.cli
mkdir -p /root/.supabase
mkdir -p /root/.config/clerk
mkdir -p /root/.config/stripe

# Fix SSH key permissions if mounted
if [ -d "/root/.ssh" ]; then
    chmod 700 /root/.ssh
    find /root/.ssh -type f -name "*.pem" -exec chmod 400 {} \; 2>/dev/null || true
    find /root/.ssh -type f -name "id_*" ! -name "*.pub" -exec chmod 600 {} \; 2>/dev/null || true
fi

# Install Go tools
echo "Installing Go tools..."
go install golang.org/x/tools/gopls@latest 2>/dev/null || echo "gopls install skipped"
go install github.com/go-delve/delve/cmd/dlv@latest 2>/dev/null || echo "dlv install skipped"

# Install .NET tools
echo "Installing .NET tools..."
dotnet tool install -g dotnet-ef 2>/dev/null || echo "dotnet-ef already installed"

# Verify CLIs
echo ""
echo "=========================================="
echo "CLI Versions:"
echo "=========================================="
echo "Node.js: $(node --version 2>/dev/null || echo 'not installed')"
echo "npm: $(npm --version 2>/dev/null || echo 'not installed')"
echo ".NET: $(dotnet --version 2>/dev/null || echo 'not installed')"
echo "Go: $(go version 2>/dev/null || echo 'not installed')"
echo "Python: $(python3 --version 2>/dev/null || echo 'not installed')"
echo "Docker: $(docker --version 2>/dev/null || echo 'not installed')"
echo "gh: $(gh --version 2>/dev/null | head -1 || echo 'not installed')"
echo "az: $(az --version 2>/dev/null | head -1 || echo 'not installed')"
echo "infisical: $(infisical --version 2>/dev/null || echo 'not installed')"
echo "supabase: $(supabase --version 2>/dev/null || echo 'not installed')"
echo "vercel: $(vercel --version 2>/dev/null || echo 'not installed')"
echo "claude: $(claude --version 2>/dev/null || echo 'not installed')"
echo "oci: $(oci --version 2>/dev/null || echo 'not installed')"
echo "clerk: $(clerk --version 2>/dev/null || echo 'not installed')"
echo "stripe: $(stripe --version 2>/dev/null || echo 'not installed')"

echo ""
echo "=========================================="
echo "Post-create setup complete!"
echo "=========================================="
