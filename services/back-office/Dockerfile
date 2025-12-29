# ===========================================
# Back Office - Next.js Application
# ===========================================
# Multi-stage build for smaller image size

FROM node:20-alpine AS builder

WORKDIR /app

# Supabase public config (embedded at build time)
ARG NEXT_PUBLIC_SUPABASE_URL=https://dseyuaoarfrkihzujutz.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZXl1YW9hcmZya2loenVqdXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzY2ODYsImV4cCI6MjA4MDc1MjY4Nn0.sA19TSAAHzTu4TvpdCvfMcB8ZTHzR-rAAFiWISefOjo

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

