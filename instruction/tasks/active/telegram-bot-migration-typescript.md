# Telegram Bot Migration: Python to TypeScript (grammY)

**Status:** Pending
**Priority:** High
**Created:** 2026-01-12

## Overview

Migrate the Telegram bot from Python (`python-telegram-bot`) to TypeScript (`grammY`) with webhooks for improved reliability. Retire the existing Python service at `services/social-media/telegram/`.

## Why Migrate?

| Issue with Current Python Bot | Solution |
|-------------------------------|----------|
| Connection drops (polling instability) | Switch to webhooks |
| No progress indicator during AI processing | Send "typing" every 4 seconds |
| No conversation context persistence | cursor-agent `--resume` with UUID |
| Fragile error handling | Circuit breaker pattern |
| Hardcoded AI Hub endpoint | Configurable via environment |

## Key Decisions

| Decision | Choice |
|----------|--------|
| Framework | grammY (TypeScript) |
| Update Mode | Webhooks (via Caddy) |
| Deployment | Same VM Docker |
| AI Sessions | cursor-agent `--resume` with UUID |

---

## New Service Location

```
services/social-media/telegram-ts/
├── src/
│   ├── index.ts                    # Entry point (bot + health server)
│   ├── config.ts                   # Environment configuration
│   ├── types/
│   │   ├── context.ts              # Custom BotContext with session
│   │   └── session.ts              # Session/database row types
│   ├── infrastructure/
│   │   ├── database.ts             # DatabaseContext (pg Pool)
│   │   └── redis.ts                # Redis client wrapper
│   ├── middleware/
│   │   ├── index.ts                # Middleware stack composition
│   │   ├── logger.ts               # JSON structured logging
│   │   ├── session.ts              # DB session hydration
│   │   ├── rate-limiter.ts         # Rate limiting checks
│   │   └── error-handler.ts        # Global error handler
│   ├── composers/
│   │   ├── start.ts                # /start + registration flow
│   │   ├── help.ts                 # /help command
│   │   ├── login.ts                # /login command
│   │   ├── logout.ts               # /logout command
│   │   ├── status.ts               # /status command
│   │   └── messages.ts             # AI message handling
│   ├── services/
│   │   ├── ai-hub-client.ts        # AI Hub HTTP + progress indicator
│   │   └── circuit-breaker.ts      # Fault tolerance
│   └── utils/
│       └── message-splitter.ts     # Split long messages
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Create `services/social-media/telegram-ts/` folder
- [ ] Initialize `package.json` with dependencies:
  - `grammy`, `hono`, `@hono/node-server`, `pg`, `ioredis`, `uuid`
- [ ] Create `tsconfig.json` (ES2022, NodeNext modules)
- [ ] Create `.env.example` with required variables

### Phase 2: Infrastructure Layer
- [ ] `src/infrastructure/database.ts` - DatabaseContext with pg Pool
  - `fetchOne<T>()`, `fetchAll<T>()`, `execute()`, `transaction()`
  - Connection pooling (max: 10, idle timeout: 30s)
- [ ] `src/infrastructure/redis.ts` - RedisClient wrapper
  - `get()`, `set()`, `del()`, `incr()`, `expire()`
- [ ] `src/config.ts` - Environment configuration object

### Phase 3: Type Definitions
- [ ] `src/types/context.ts` - BotContext extending grammY Context
  - Add `db: DatabaseContext`, `redis: RedisClient`
  - Add `telegramSession: TelegramSessionRow | null`
- [ ] `src/types/session.ts` - Database row types
  - `TelegramUserRow`, `TelegramSessionRow`, `TelegramRateLimitRow`

### Phase 4: Middleware Stack
Order: error-handler → logger → session → rate-limiter

- [ ] `src/middleware/error-handler.ts` - Catch-all error handler
  - Log errors with JSON structure
  - Reply to user with generic error message
- [ ] `src/middleware/logger.ts` - Request/response logging
  - Log: user_id, chat_id, update_type, duration_ms
- [ ] `src/middleware/session.ts` - Load active session from DB
  - Query `telegram_sessions` JOIN `telegram_users`
  - Populate `ctx.telegramSession`
- [ ] `src/middleware/rate-limiter.ts` - Rate limit utilities
  - `checkRateLimit(ctx, userId, action)` → `{allowed, retryAfterMinutes}`

### Phase 5: Command Composers
- [ ] `src/composers/start.ts` - /start command
  - Check if user exists → welcome back or prompt registration
  - Create session with new `cursor_chat_id` (UUID)
- [ ] `src/composers/help.ts` - /help command
- [ ] `src/composers/login.ts` - /login command
  - Check rate limit (5/15min)
  - Create new session, delete existing ones
- [ ] `src/composers/logout.ts` - /logout command
  - Delete active session
- [ ] `src/composers/status.ts` - /status command
  - Show: logged in / registered but not logged in / not registered

### Phase 6: Message Handler with AI Integration
- [ ] `src/composers/messages.ts` - Text message handler
  - Handle pending registration (Yes/No flow)
  - Check active session before AI call
  - Call AI Hub with progress indicator
  - Split long responses (>4000 chars)

### Phase 7: AI Hub Client with Progress Indicator
- [ ] `src/services/ai-hub-client.ts` - AIHubClient class
  - `chatWithProgress(ctx, message, cursorChatId)` method
  - Send `typing` action every 4 seconds
  - 120 second timeout
  - Circuit breaker integration
  - Log timeout reasons with JSON structure
- [ ] `src/services/circuit-breaker.ts` - CircuitBreaker class
  - States: CLOSED → OPEN → HALF_OPEN
  - Failure threshold: 3, reset timeout: 30s

### Phase 8: Entry Point
- [ ] `src/index.ts` - Main entry point
  - Initialize grammY Bot
  - Initialize infrastructure (DB, Redis)
  - Compose middleware stack
  - Register all composers
  - Create Hono HTTP server:
    - `GET /health` - Health check
    - `POST /webhook` - Telegram webhook
  - Graceful shutdown handling

### Phase 9: Dockerfile
- [ ] Multi-stage build (builder → runner)
- [ ] Node.js 20 Alpine base
- [ ] Non-root user (`botuser`)
- [ ] Health check: `wget -qO- http://localhost:8087/health`

### Phase 10: Database Migration
```sql
-- Add cursor_chat_id column for --resume support
ALTER TABLE telegram_sessions
ADD COLUMN IF NOT EXISTS cursor_chat_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_cursor_chat_id
ON telegram_sessions(cursor_chat_id)
WHERE cursor_chat_id IS NOT NULL;
```

### Phase 11: AI Hub Changes
- [ ] Update `schemas.py` - Add `session_id` to `CLIMessageRequest`
- [ ] Update `telegram_versions.py` - Pass `--resume` flag when `session_id` provided
- [ ] Update endpoint handlers in `main.py` to pass `session_id` to executor

### Phase 12: Docker Compose Updates
File: `deployment/vm/docker-compose.yml`

```yaml
telegram-bot-ts:
  image: stocktracker-telegram-bot-ts:latest
  build:
    context: ./repo/services/social-media/telegram-ts
    dockerfile: Dockerfile
  container_name: telegram-bot-ts
  restart: unless-stopped
  environment:
    - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    - WEBHOOK_URL=https://nxserver.malaysiawest.cloudapp.azure.com/telegram/webhook
    - DATABASE_URL_TS=${DATABASE_URL_TS}
    - REDIS_URL=redis://redis:6379
    - AI_HUB_URL=http://ai-hub-docker:8080
    - AI_HUB_API_KEY=${AI_HUB_API_KEY}
    - BOT_PORT=8087
  networks:
    - stocktracker
  depends_on:
    - ai-hub-docker
    - redis
```

### Phase 13: Caddyfile Updates
File: `deployment/vm/Caddyfile`

```
handle /telegram/webhook {
    reverse_proxy telegram-bot-ts:8087
}
```

### Phase 14: Webhook Setup
```bash
# Set webhook (run once after deployment)
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://nxserver.malaysiawest.cloudapp.azure.com/telegram/webhook",
    "allowed_updates": ["message", "callback_query"],
    "drop_pending_updates": true
  }'
```

### Phase 15: CI/CD Updates
File: `.github/workflows/deploy-vm.yml`

- [ ] Add trigger path: `services/social-media/telegram-ts/**`
- [ ] Add build step for telegram-bot-ts image
- [ ] Add to image loading list

### Phase 16: Retire Python Service
- [ ] Remove `telegram-bot` from `deployment/vm/docker-compose.yml`
- [ ] Archive `services/social-media/telegram/` folder (or delete)

---

## Environment Variables (New)

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token (existing) |
| `WEBHOOK_URL` | Full webhook URL for Telegram |
| `DATABASE_URL_TS` | PostgreSQL URL for Node.js pg |
| `REDIS_URL` | Redis connection URL |
| `AI_HUB_URL` | AI Hub internal URL |
| `AI_HUB_API_KEY` | AI Hub authentication key |
| `BOT_PORT` | HTTP server port (8087) |

---

## Files to Modify

| File | Action |
|------|--------|
| `services/ai/ai-hub/schemas.py` | Add `session_id` field |
| `services/ai/ai-hub/services/telegram_versions.py` | Add `--resume` flag support |
| `services/ai/ai-hub/main.py` | Pass `session_id` to executor |
| `deployment/vm/docker-compose.yml` | Add `telegram-bot-ts`, remove `telegram-bot` |
| `deployment/vm/Caddyfile` | Add webhook route |
| `.github/workflows/deploy-vm.yml` | Add CI/CD for new service |

---

## Files to Create

| File | Description |
|------|-------------|
| `services/social-media/telegram-ts/` | Entire new service folder |
| `services/social-media/telegram-ts/package.json` | Dependencies |
| `services/social-media/telegram-ts/tsconfig.json` | TypeScript config |
| `services/social-media/telegram-ts/Dockerfile` | Docker build |
| `services/social-media/telegram-ts/src/**` | All source files |

---

## Key Patterns

### Progress Indicator Pattern
```typescript
// Send typing every 4 seconds while AI processes
const interval = setInterval(() => {
  ctx.api.sendChatAction(chatId, "typing");
}, 4000);

try {
  const response = await aiClient.chat(message);
  return response;
} finally {
  clearInterval(interval);
}
```

### Circuit Breaker Pattern
```typescript
// CLOSED → OPEN after 3 failures
// OPEN → HALF_OPEN after 30 seconds
// HALF_OPEN → CLOSED on success, OPEN on failure
```

### Session with cursor_chat_id
```typescript
// On /start or /login: Generate new UUID
const cursorChatId = uuidv4();

// On AI request: Pass to AI Hub
const response = await aiClient.chat(message, cursorChatId);

// AI Hub adds to cursor-agent command:
// cursor-agent -p "message" --resume <cursorChatId> --model sonnet-4.5
```

---

## Database Tables (Existing - Reuse)

### telegram_users
```sql
CREATE TABLE telegram_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    telegram_username VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### telegram_sessions
```sql
CREATE TABLE telegram_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    telegram_user_id BIGINT NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    device_info JSONB DEFAULT '{}',
    session_token UUID DEFAULT gen_random_uuid(),
    cursor_chat_id UUID DEFAULT NULL  -- NEW: For cursor-agent --resume
);
```

### telegram_rate_limits
```sql
CREATE TABLE telegram_rate_limits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    action_type VARCHAR(20) NOT NULL,  -- 'register', 'login'
    attempt_count INT DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(telegram_user_id, action_type)
);
```

---

## Testing Checklist

- [ ] /start - New user registration flow
- [ ] /start - Returning user welcome
- [ ] /login - Create session with rate limiting
- [ ] /logout - Delete session
- [ ] /status - Show correct state
- [ ] /help - Display help text
- [ ] AI message - Progress indicator shows
- [ ] AI message - Response received correctly
- [ ] AI message - Long responses split properly
- [ ] AI timeout - Graceful error message
- [ ] Rate limit - Blocks after threshold
- [ ] Circuit breaker - Opens after failures
- [ ] --resume - Conversation context persists

---

## References

- grammY documentation: https://grammy.dev/
- Current Python bot: `services/social-media/telegram/`
- AI Hub service: `services/ai/ai-hub/`
- Docker deployment: `deployment/vm/docker-compose.yml`
- Related task: `instruction/tasks/active/telegram-agent-ux-improvements.md`
