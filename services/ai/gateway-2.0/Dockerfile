# Gateway 2.0 - Self-contained Docker image
# Includes: Node.js app + cursor-agent CLI + agent-context + tier-homes
# Only one VM host mount needed: auth.json (read-only)

# ============================================================================
# Stage 1: Build the TypeScript application
# ============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

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

# Install cursor-agent CLI
RUN curl -fsSL https://cursor.com/install | bash || true
# Verify installation (non-fatal if not available in build environment)
RUN which cursor-agent && cursor-agent --version || echo "cursor-agent will be available at runtime"

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Bake agent-context into the image (rebuild to update)
COPY agent-context/ /app/agent-context/

# Bake tier-homes into the image (per-tier MCP configs)
COPY tier-homes/ /app/tier-homes/

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
  CMD wget -qO- http://localhost:8080/health/live || exit 1

# Start the gateway
CMD ["node", "dist/index.js"]
