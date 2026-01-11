# AI Hub Service Dockerfile
# Multi-stage build for smaller final image
#
# This Dockerfile supports two deployment modes:
# 1. Docker container with mounted CLIs (production Docker mode)
# 2. Systemd service on VM host (production host mode - backup)
#
# For Docker mode, CLIs (claude, cursor-agent) and auth configs are volume-mounted
# from the VM host at runtime.

# Build stage
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies including Node.js 20.x for Claude CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create directories for CLI mounts (actual binaries mounted at runtime)
# - /usr/lib/node_modules/@anthropic-ai/ -> Claude CLI node modules
# - /opt/cursor-agent/ -> Cursor-agent versions
# - /root/.claude/, /root/.cursor/ -> CLI auth configs
# - /home/azureuser/stock-tracker/ -> Instruction/context folder
RUN mkdir -p /usr/lib/node_modules/@anthropic-ai \
    && mkdir -p /opt/cursor-agent \
    && mkdir -p /root/.claude \
    && mkdir -p /root/.cursor \
    && mkdir -p /root/.config/cursor \
    && mkdir -p /home/azureuser/stock-tracker

# Create symlink for claude CLI (points to mounted node_modules)
RUN ln -s /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js /usr/local/bin/claude

# Copy cursor-agent wrapper script
COPY scripts/cursor-agent-wrapper /usr/local/bin/cursor-agent
RUN chmod +x /usr/local/bin/cursor-agent

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser
# Note: Running as root for now due to CLI permission requirements
# (CLIs need to read auth configs from /root/.claude, /root/.cursor)

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health/live || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
