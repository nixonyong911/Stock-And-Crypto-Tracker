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
# Runtime stage
# ===========================================
FROM alpine:3.19

# Install runtime dependencies
RUN apk --no-cache add \
    ca-certificates \
    bash \
    curl \
    wget \
    nodejs \
    npm

# Create non-root user (optional, comment out if CLI needs root)
# RUN adduser -D -g '' appuser

WORKDIR /app

# Copy binary from builder
COPY --from=builder /ai-hub2 /app/ai-hub2

# CLI binaries will be available via volume mounts from host:
# - /usr/lib/node_modules/@anthropic-ai (claude)
# - /opt/cursor-agent (cursor-agent)
#
# Add volume mount paths to PATH
ENV PATH="/usr/lib/node_modules/@anthropic-ai/claude-code/bin:/opt/cursor-agent/bin:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:8080/health/live || exit 1

# Expose port
EXPOSE 8080

# Run as root (required for CLI access via volume mounts)
# USER appuser

# Start the server
CMD ["/app/ai-hub2"]
