# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk add --no-cache ca-certificates

# Copy go mod files first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o fred-worker .

# Final stage - minimal image
FROM alpine:3.19

# Install ca-certificates and wget (for healthcheck)
RUN apk --no-cache add ca-certificates wget tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/fred-worker .

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health/live || exit 1

# Run as non-root user
RUN adduser -D -g '' appuser
USER appuser

CMD ["./fred-worker"]
