# Gateway 2.0 - Self-contained Docker image
# Includes: Node.js app + cursor-agent CLI + agent-context + tier-homes
# Only one VM host mount needed: auth.json (read-only)

# ============================================================================
# Stage 1: Build the TypeScript application + generate tier-homes
# ============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Generate tier-homes from mcp-manifest.json (plain JS, no TS needed)
COPY mcp-manifest.json ./
COPY scripts/ ./scripts/
RUN node scripts/generate-tier-homes.js

# ============================================================================
# Stage 2: Production image
# ============================================================================
FROM node:20-slim

WORKDIR /app

# Install system dependencies for cursor-agent
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# cursor-agent CLI is volume-mounted from VM host at:
#   /home/azureuser/.local/share/cursor-agent/versions/<ver>/cursor-agent
# Create a wrapper script that finds the latest mounted version at runtime.
RUN printf '#!/bin/bash\nset -euo pipefail\nVERDIR="/home/azureuser/.local/share/cursor-agent/versions"\nLATEST=$(ls -1d "$VERDIR"/*/ 2>/dev/null | sort -V | tail -1)\nif [ -z "$LATEST" ]; then echo "cursor-agent not mounted" >&2; exit 1; fi\nexec "$LATEST/cursor-agent" "$@"\n' > /usr/local/bin/cursor-agent \
    && chmod +x /usr/local/bin/cursor-agent

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Bake agent-context into the image (rebuild to update)
COPY agent-context/ /app/agent-context/

# Bake generated tier-homes from builder stage (per-tier MCP configs)
COPY --from=builder /app/tier-homes /app/tier-homes

# Create auth symlinks: each tier home's cursor config points to the
# volume-mounted auth.json from the VM host.
# cursor-agent reads: $HOME/.config/cursor/auth.json
RUN for tier in free pro max dev; do \
      mkdir -p /app/tier-homes/$tier/.config/cursor && \
      ln -sf /root/.config/cursor/auth.json /app/tier-homes/$tier/.config/cursor/auth.json; \
    done

# Expose the gateway port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:8080/health/live || exit 1

# Start the gateway
CMD ["node", "dist/index.js"]
