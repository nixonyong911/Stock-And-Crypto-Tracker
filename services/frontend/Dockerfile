# ===========================================
# Frontend Staging - Next.js Application
# ===========================================
# Multi-stage build for smaller image size
# Used for staging deployment on Azure VM

FROM node:20-alpine AS builder

WORKDIR /app

# ===========================================
# Build Args - NEXT_PUBLIC_* vars embedded at build time
# ===========================================
# These are passed from docker-compose build args
# NEVER hardcode secrets here - they come from Infisical

# Clerk Authentication
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Stripe
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_STRIPE_PAYMENT_LINK_MONTHLY
ARG NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ANNUAL

# App URL (for redirects)
ARG NEXT_PUBLIC_APP_URL

# Staging flag - enables basePath and standalone output
ARG USE_BASE_PATH=true

# ===========================================
# Set env vars for Next.js build
# ===========================================
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PAYMENT_LINK_MONTHLY=$NEXT_PUBLIC_STRIPE_PAYMENT_LINK_MONTHLY
ENV NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ANNUAL=$NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ANNUAL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV USE_BASE_PATH=$USE_BASE_PATH

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# ===========================================
# Production image
# ===========================================
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

# Use port 3001 to avoid conflict with back-office on 3000
EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
