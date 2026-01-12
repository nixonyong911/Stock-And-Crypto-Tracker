# ===========================================
# Telegram Bot 2.0 - Multi-stage build
# ===========================================

# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ===========================================
# Runner stage
# ===========================================
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S botgroup && adduser -S botuser -G botgroup

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Switch to non-root user
USER botuser

# Expose port
EXPOSE 8087

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8087/health || exit 1

# Start the bot
CMD ["node", "dist/index.js"]
