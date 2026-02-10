# ===========================================
# Gateway - Multi-stage Dockerfile
# ===========================================

# Build stage
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /gateway \
    ./cmd/server

# ===========================================
# Runtime stage
# ===========================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates bash curl wget gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary
COPY --from=builder /gateway /app/gateway

# Copy agent context (baked into image, managed in IDE)
COPY agent-context/ /app/agent-context/

# Copy tier homes (per-tier MCP configs)
COPY tier-homes/ /app/tier-homes/

# Create directories for CLI mounts
RUN mkdir -p /usr/lib/node_modules/@anthropic-ai \
    && mkdir -p /opt/cursor-agent \
    && mkdir -p /root/.claude \
    && mkdir -p /root/.cursor \
    && mkdir -p /root/.config/cursor

# Create symlink for claude CLI
RUN ln -s /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js /usr/local/bin/claude

# Create cursor-agent wrapper script
RUN printf '#!/bin/bash\nset -e\nexport PATH="/opt/cursor-agent/versions/$(ls -1 /opt/cursor-agent/versions 2>/dev/null | sort -r | head -1):$PATH"\nexec cursor-agent "$@"\n' > /usr/local/bin/cursor-agent && chmod +x /usr/local/bin/cursor-agent

# Symlink CLI credentials into each tier home
RUN for tier in free pro max dev; do \
      ln -sf /root/.claude /app/tier-homes/$tier/.claude && \
      ln -sf /root/.claude.json /app/tier-homes/$tier/.claude.json && \
      ln -sf /root/.claude-mcp.json /app/tier-homes/$tier/.claude-mcp.json && \
      mkdir -p /app/tier-homes/$tier/.config && \
      ln -sf /root/.config/cursor /app/tier-homes/$tier/.config/cursor; \
    done

ENV PATH="/root/.local/bin:/usr/local/bin:${PATH}"

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8080/health/live || exit 1

EXPOSE 8080

CMD ["/app/gateway"]
