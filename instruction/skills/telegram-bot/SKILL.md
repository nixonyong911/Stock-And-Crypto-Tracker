---
name: telegram-bot
description: Guide for the Telegram AI Financial Assistant bot. Use when working with Telegram bot registration, authentication, session management, rate limiting, or extending bot capabilities. The bot uses Yes/No registration via /start, single-session policy (new login invalidates other devices), and rate limiting for security.
---

# Telegram Bot Skill

## Overview

The Telegram AI Financial Assistant is a multi-component system that allows authenticated users to interact with an AI assistant for financial queries. The assistant is strictly governed to only respond to stock, crypto, and financial market questions.

## Quick Reference

| Component | Path | Purpose |
|-----------|------|---------|
| Telegram Bot Service | `services/social-media/telegram/` | Bot handlers and services |
| Session Service | `services/social-media/telegram/services/session.py` | Auth, rate limiting |
| Command Handlers | `services/social-media/telegram/handlers/commands.py` | /start, /login, etc. |
| AI Hub Endpoint | `services/ai/ai-hub/main.py` | Governed AI endpoint |
| MCP Server | `services/mcp/` | Read-only DB queries |
| Architecture Doc | `instruction/architecture/telegram-bot-architecture.md` | System overview |

## Setup Guide

### Prerequisites

1. **Telegram Bot** (created via @BotFather)
   - Main bot for user interaction

2. **Environment Variables in Infisical**
   - `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
   - `DATABASE_URL_PYTHON` - PostgreSQL DSN for asyncpg (see format below)
   - `AI_HUB_URL` - AI Hub endpoint (default: `http://host.docker.internal:8084`)
   - `AI_HUB_API_KEY` - AI Hub authentication key

### Database Connection (DATABASE_URL_PYTHON)

Python's `asyncpg` requires PostgreSQL DSN format. Use Supabase **Session Pooler** for IPv4 compatibility:

```
postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres
```

**Example:**
```
postgresql://postgres.dseyuaoarfrkihzujutz:MyPass%2A123@aws-1-us-east-2.pooler.supabase.com:5432/postgres
```

**Important:**
- Use Session Pooler (port 5432), NOT direct connection (IPv6 only)
- URL-encode special characters in password (`*` → `%2A`, `@` → `%40`)
- User format: `postgres.<project-ref>` (not just `postgres`)

3. **Database Tables** (already applied)
   - `telegram_users` - Registered users
   - `telegram_sessions` - Active sessions with device_info
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
# Login from another device → first device session invalidated
```

### Rate Limits

| Action | Limit | Window |
|--------|-------|--------|
| Registration | 3 attempts | 60 minutes |
| Login | 5 attempts | 15 minutes |

## Extending the Bot

### Adding New Commands

1. Add handler function in `handlers/commands.py`
2. Register in `setup_command_handlers()` at bottom of file
3. Import any needed services

Example:
```python
async def mycommand_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /mycommand."""
    await update.message.reply_text("Response here")

# In setup_command_handlers():
application.add_handler(CommandHandler("mycommand", mycommand_command))
```

### Adding AI Capabilities

The AI is governed by a system prompt in `services/ai/ai-hub/main.py`. To modify allowed topics:

```python
TELEGRAM_AGENT_SYSTEM_PROMPT = """..."""
```

**Warning:** Be careful not to allow code execution or system commands.

### Modifying Rate Limits

Update `RATE_LIMITS` in `services/session.py`:
```python
RATE_LIMITS = {
    "register": {"max_attempts": 3, "window_minutes": 60},
    "login": {"max_attempts": 5, "window_minutes": 15},
}
```

### Adding MCP Tools

1. Add function in `services/mcp/tools/analysis.py`
2. Register tool in `services/mcp/server.py`
3. Update `services/mcp/tools/__init__.py`

Example tool pattern:

```python
@mcp.tool(
    name="analysis_new_tool",
    annotations={
        "readOnlyHint": True,
        "destructiveHint": False,
    }
)
async def analysis_new_tool(params: InputModel) -> str:
    """Tool description."""
    return await query_function(params)
```

## Troubleshooting

### Bot Not Responding

1. Check Docker container: `docker logs telegram-bot`
2. Verify `TELEGRAM_BOT_TOKEN` is set
3. Check health endpoint: `curl http://localhost:8087/health`

### Database Connection Errors

Common error: `invalid DSN: scheme is expected to be either "postgresql" or "postgres"`

1. Check `DATABASE_URL_PYTHON` is set: `docker exec telegram-bot env | grep DATABASE`
2. Verify format starts with `postgresql://` (not `.NET` connection string)
3. Use Session Pooler host (`pooler.supabase.com:5432`), not direct (`db.xxx.supabase.co`)
4. URL-encode special characters in password

### AI Hub Errors

1. Check systemd status: `sudo systemctl status ai-hub`
2. View logs: `journalctl -u ai-hub -f`
3. Verify `AI_HUB_API_KEY` is set

### Rate Limit Issues

1. Check `telegram_rate_limits` table
2. Reset limits: `DELETE FROM telegram_rate_limits WHERE telegram_user_id = X`
3. Adjust limits in `services/session.py` if needed

### Session Issues

1. Check `telegram_sessions` table for expired sessions
2. Single-session policy: only one active session per user
3. Clear and re-login with /login

### MCP Server Issues

1. Check Docker logs: `docker logs mcp-analysis`
2. Verify `DATABASE_URL` is correct
3. Test health endpoint: `curl http://localhost:8085/health`

## Related Documentation

- [Architecture Overview](../../architecture/telegram-bot-architecture.md)
- [Database Schema](../../database/schema.md)
- [AI Hub Integration](../../reference/ai-hub-integration.md)

