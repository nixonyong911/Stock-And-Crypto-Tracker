---
name: telegram-bot
description: Guide for the Telegram AI Financial Assistant bot (TypeScript/grammY, telegram-2.0). Use when working with Telegram bot registration, authentication, session management, rate limiting, or extending bot capabilities. The bot uses Yes/No registration via /start, single-session policy (new login invalidates other devices), webhooks via Caddy, and the Gateway for AI responses.
---

# Telegram Bot Skill (telegram-2.0)

## Overview

The Telegram AI Financial Assistant is a TypeScript bot built with grammY, using webhooks for reliability. It allows authenticated users to interact with an AI assistant for financial queries via the Gateway service.

## Quick Reference

| Component | Path | Purpose |
|-----------|------|---------|
| Telegram Bot Service | `services/social-media/telegram-2.0/` | Bot composers, middleware, services |
| Config | `services/social-media/telegram-2.0/src/config.ts` | Environment configuration |
| Gateway Client | `services/social-media/telegram-2.0/src/services/gateway-client.ts` | AI Gateway integration |
| Session Middleware | `services/social-media/telegram-2.0/src/middleware/session.ts` | Auth, session hydration |
| Rate Limiter | `services/social-media/telegram-2.0/src/middleware/rate-limiter.ts` | Rate limiting |
| Command Composers | `services/social-media/telegram-2.0/src/composers/` | /start, /login, /logout, etc. |
| Gateway Service | `services/ai/gateway/` | AI request routing |
| MCP Server | `services/mcp/` | Read-only DB queries |

## Setup Guide

### Prerequisites

1. **Telegram Bot** (created via @BotFather)

2. **Environment Variables in Infisical**
   - `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
   - `WEBHOOK_URL` - Full webhook URL (e.g. `https://nxserver.malaysiawest.cloudapp.azure.com/telegram/webhook`)
   - `DATABASE_URL` - PostgreSQL connection string
   - `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379`)
   - `GATEWAY_URL` - Gateway service URL
   - `GATEWAY_API_KEY` - Gateway authentication key
   - `BOT_PORT` - HTTP server port (default: `8087`)

3. **Database Tables** (already applied)
   - `telegram_users` - Registered users
   - `telegram_sessions` - Active sessions with device_info, cursor_chat_id
   - `telegram_rate_limits` - Rate limiting

### Testing

```bash
# 1. Click "Register for Telegram Bot" on frontend
# Opens Telegram with /start command

# 2. Reply "Yes" to registration prompt
# Auto-logged in after registration

# 3. Ask financial questions
"What are the bullish stocks today?"
"Show me AAPL candlestick patterns for last week"

# 4. Test single-session policy
# Login from another device -> first device session invalidated
```

### Rate Limits

| Action | Limit | Window |
|--------|-------|--------|
| Registration | 3 attempts | 60 minutes |
| Login | 5 attempts | 15 minutes |

## Extending the Bot

### Adding New Commands

1. Create a new composer file in `src/composers/`
2. Register it in `src/index.ts`

Example:
```typescript
import { Composer } from 'grammy';
import type { BotContext } from '../types/context.js';

const composer = new Composer<BotContext>();

composer.command('mycommand', async (ctx) => {
  await ctx.reply('Response here');
});

export default composer;
```

### AI Integration

AI requests go through the Gateway service via `src/services/gateway-client.ts`. The client includes:
- Progress indicator (typing action every 4 seconds)
- Circuit breaker pattern (3 failures -> open, 30s reset)
- 300s timeout for long-running AI requests

### Modifying Rate Limits

Update `rateLimits` in `src/config.ts`:
```typescript
rateLimits: {
  register: { maxAttempts: 3, windowMinutes: 60 },
  login: { maxAttempts: 5, windowMinutes: 15 },
},
```

### Adding MCP Tools

1. Add function in `services/mcp/tools/analysis.py`
2. Register tool in `services/mcp/server.py`
3. Update `services/mcp/tools/__init__.py`

## Troubleshooting

### Bot Not Responding

1. Check Docker container: `docker logs telegram-bot-2.0`
2. Verify `TELEGRAM_BOT_TOKEN` is set
3. Check health endpoint: `curl http://localhost:8087/health`
4. Verify webhook is set: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

### Database Connection Errors

1. Check `DATABASE_URL` is set: `docker exec telegram-bot-2.0 env | grep DATABASE`
2. Verify format starts with `postgresql://`
3. Use Session Pooler host (`pooler.supabase.com:5432`)
4. URL-encode special characters in password

### Gateway Errors

1. Check Gateway status: `docker ps --filter name=gateway`
2. View logs: `docker logs gateway -f`
3. Verify `GATEWAY_API_KEY` is set

### Rate Limit Issues

1. Check `telegram_rate_limits` table
2. Reset limits: `DELETE FROM telegram_rate_limits WHERE telegram_user_id = X`
3. Adjust limits in `src/config.ts`

### Session Issues

1. Check `telegram_sessions` table for expired sessions
2. Single-session policy: only one active session per user
3. Clear and re-login with /login

### MCP Server Issues

1. Check Docker logs: `docker logs mcp-analysis`
2. Verify `DATABASE_URL` is correct
3. Test health endpoint: `curl http://localhost:8085/health`

## Related Documentation

- [Database Schema](../../database/schema.md)
