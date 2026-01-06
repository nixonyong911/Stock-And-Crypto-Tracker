---
name: telegram-bot
description: Guide for setting up, configuring, and extending the Telegram AI Financial Assistant bot. Use when working with Telegram bot features, user authentication, or n8n workflow modifications.
---

# Telegram Bot Skill

## Overview

The Telegram AI Financial Assistant is a multi-component system that allows authenticated users to interact with an AI assistant for financial queries. The assistant is strictly governed to only respond to stock, crypto, and financial market questions.

## Quick Reference

| Component | Path | Purpose |
|-----------|------|---------|
| Frontend Registration | `services/frontend/src/app/register/` | User sign-up form |
| AI Hub Endpoint | `services/ai/ai-hub/main.py` | Governed AI endpoint |
| MCP Server | `services/mcp/` | Read-only DB queries |
| Architecture Doc | `instruction/architecture/telegram-bot-architecture.md` | System overview |

## Setup Guide

### Prerequisites

1. **Telegram Bots** (created via @BotFather)
   - Main bot for user interaction
   - OTP bot for verification codes

2. **Environment Variables in Infisical**
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_OTP_BOT_TOKEN`

3. **Database Tables** (already applied)
   - `telegram_users`
   - `telegram_sessions`
   - `telegram_otp`

### n8n Workflow Setup

1. Open n8n at `https://nxserver.malaysiawest.cloudapp.azure.com/`
2. Create new workflow "Telegram AI Financial Assistant"
3. Add nodes:
   - Telegram Trigger (message updates)
   - Switch (route commands)
   - Code nodes (login/logout/session handlers)
   - HTTP Request (AI Hub call)
   - Telegram (send responses)
4. Configure credentials for Telegram bots
5. Set environment variable `AI_HUB_API_KEY` in n8n

### Testing

```bash
# 1. Register at frontend
open https://your-frontend.vercel.app/register

# 2. Test login in Telegram
/login +60123456789

# 3. Enter OTP from second bot

# 4. Ask financial questions
"What are the bullish stocks today?"
"Show me AAPL candlestick patterns for last week"
```

## Extending the Bot

### Adding New Commands

1. Add case in n8n Switch node
2. Create handler Code node
3. Connect to response node

### Adding AI Capabilities

The AI is governed by a system prompt in `services/ai/ai-hub/main.py`. To modify allowed topics:

```python
TELEGRAM_AGENT_SYSTEM_PROMPT = """..."""
```

**Warning:** Be careful not to allow code execution or system commands.

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

1. Check n8n workflow is active
2. Verify Telegram credentials
3. Check n8n logs for errors

### AI Hub Errors

1. Check systemd status: `sudo systemctl status ai-hub`
2. View logs: `journalctl -u ai-hub -f`
3. Verify API key is set

### Session Issues

1. Check `telegram_sessions` table for expired sessions
2. Verify session token in workflow
3. Clear and re-login

### MCP Server Issues

1. Check Docker logs: `docker logs mcp-analysis`
2. Verify `DATABASE_URL` is correct
3. Test health endpoint: `curl http://localhost:8085/health`

## Related Documentation

- [Architecture Overview](../../architecture/telegram-bot-architecture.md)
- [Database Schema](../../database/schema.md)
- [AI Hub Integration](../../reference/ai-hub-integration.md)

