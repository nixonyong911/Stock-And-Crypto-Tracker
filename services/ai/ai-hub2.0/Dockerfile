# ===========================================
# AI Hub 2.0 - Multi-stage Dockerfile
# ===========================================
# Build: docker build -t stocktracker-ai-hub2 .
# Run:   docker run -p 8080:8080 stocktracker-ai-hub2
# ===========================================

# Build stage
FROM golang:1.22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /ai-hub2 \
    ./cmd/server

# ===========================================
# Runtime stage - Use Debian for glibc compatibility with cursor-agent
# ===========================================
FROM debian:bookworm-slim

# Install runtime dependencies including Node.js 20.x for Claude CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    bash \
    curl \
    wget \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /ai-hub2 /app/ai-hub2

# Create directories for CLI mounts
RUN mkdir -p /usr/lib/node_modules/@anthropic-ai \
    && mkdir -p /opt/cursor-agent \
    && mkdir -p /root/.claude \
    && mkdir -p /root/.cursor \
    && mkdir -p /root/.config/cursor \
    && mkdir -p /home/azureuser/stock-tracker

# Create symlink for claude CLI
RUN ln -s /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js /usr/local/bin/claude

# Create cursor-agent wrapper script
RUN printf '#!/bin/bash\n\
set -e\n\
export HOME=/root\n\
VERSION_DIR=$(ls -1 /opt/cursor-agent/versions 2>/dev/null | sort -r | head -1)\n\
if [ -z "$VERSION_DIR" ]; then\n\
    echo "Error: No cursor-agent version found" >&2\n\
    exit 1\n\
fi\n\
export PATH="/opt/cursor-agent/versions/${VERSION_DIR}:$PATH"\n\
exec "/opt/cursor-agent/versions/${VERSION_DIR}/cursor-agent" "$@"\n\
' > /usr/local/bin/cursor-agent && chmod +x /usr/local/bin/cursor-agent

# Add local bin to PATH
ENV PATH="/root/.local/bin:/usr/local/bin:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8080/health/live || exit 1

# Expose port
EXPOSE 8080

# Run as root (required for CLI access via volume mounts)
# USER appuser

# Start the server
CMD ["/app/ai-hub2"]
