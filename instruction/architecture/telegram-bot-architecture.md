# Telegram AI Bot Architecture

## Overview

A Telegram bot that allows authenticated users to interact with an AI financial assistant. The system includes user registration, OTP-based authentication, and governed AI responses for financial/stock/crypto queries.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERACTION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐         ┌──────────────┐         ┌─────────────────┐     │
│   │   Frontend  │         │  Main Bot    │         │    OTP Bot      │     │
│   │  /register  │         │  (Primary)   │         │  (Verification) │     │
│   └──────┬──────┘         └──────┬───────┘         └────────┬────────┘     │
│          │                       │                          │              │
└──────────┼───────────────────────┼──────────────────────────┼──────────────┘
           │                       │                          │
           ▼                       ▼                          │
┌──────────────────────────────────────────────────────────────────────────────┐
│                              n8n WORKFLOW                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────┐     ┌─────────────┐     ┌─────────────────────────┐    │
│   │ Telegram       │────▶│   Switch    │────▶│ /login → OTP Handler   │    │
│   │ Trigger        │     │  (Router)   │────▶│ /logout → Session Clear│    │
│   │                │     │             │────▶│ message → Session Check│    │
│   └────────────────┘     └─────────────┘     └──────────┬──────────────┘    │
│                                                         │                    │
│                                                         ▼                    │
│                                              ┌─────────────────────┐         │
│                                              │    HTTP Request     │         │
│                                              │    to AI Hub        │         │
│                                              └──────────┬──────────┘         │
│                                                         │                    │
└─────────────────────────────────────────────────────────┼────────────────────┘
                                                          │
                                                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              VM SERVICES                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────┐              ┌─────────────────────────────┐      │
│   │      AI Hub         │              │       MCP Analysis          │      │
│   │  (Host, Port 8084)  │◀────────────▶│    (Docker, Port 8085)      │      │
│   │                     │              │                             │      │
│   │  /cli/telegram-     │              │  - get_stock_analysis       │      │
│   │   agent/cursor/     │              │  - list_detected_patterns   │      │
│   │   sonnet-4.5        │              │  - get_bullish_stocks       │      │
│   │                     │              │  - get_bearish_stocks       │      │
│   │  System Prompt:     │              │  - get_pattern_statistics   │      │
│   │  Financial only!    │              │                             │      │
│   └─────────────────────┘              └─────────────────────────────┘      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE DATABASE                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐  ┌───────────────────┐  ┌──────────────────┐         │
│   │  telegram_users  │  │ telegram_sessions │  │   telegram_otp   │         │
│   │                  │  │                   │  │                  │         │
│   │  - phone_number  │  │  - user_id        │  │  - phone_number  │         │
│   │  - display_name  │  │  - telegram_id    │  │  - otp_code      │         │
│   │  - telegram_user │  │  - expires_at     │  │  - expires_at    │         │
│   │  - max_devices   │  │  - session_token  │  │  - verified      │         │
│   └──────────────────┘  └───────────────────┘  └──────────────────┘         │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────┐      │
│   │              analysis_stock_candlestick_pattern                  │      │
│   │                    (READ-ONLY via MCP)                           │      │
│   └──────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Frontend Registration (`services/frontend/src/app/register/`)

Simple web form for users to register their phone number before using the Telegram bot.

**Fields:**
- Phone number (with country code)
- Display name
- Telegram username (optional)

**Files:**
- `page.tsx` - React component
- `page.module.css` - Styling
- `actions.ts` - Server action for Supabase insert

### 2. n8n Workflow

Orchestrates Telegram message handling, authentication, and AI integration.

**Nodes:**
1. **Telegram Trigger** - Receives messages from bot
2. **Switch (Router)** - Routes `/login`, `/logout`, or regular messages
3. **Login Handler** - Generates OTP, stores in DB, triggers OTP bot
4. **Logout Handler** - Clears session
5. **Session Check** - Validates user session before AI call
6. **HTTP Request** - Calls AI Hub endpoint
7. **Send Response** - Returns AI response to user

### 3. AI Hub Endpoint (`services/ai/ai-hub/`)

**Endpoint:** `/cli/telegram-agent/cursor/sonnet-4.5`

Governed AI endpoint with strict system prompt:
- **ALLOWED:** Financial, stock, crypto, candlestick patterns
- **FORBIDDEN:** CLI commands, code execution, non-financial topics

### 4. MCP Analysis Server (`services/mcp/`)

Read-only MCP server for database queries.

**Tools:**
| Tool | Description |
|------|-------------|
| `analysis_get_stock` | Query analysis for a stock symbol |
| `analysis_list_patterns` | List patterns for a date |
| `analysis_get_bullish` | Get bullish stocks |
| `analysis_get_bearish` | Get bearish stocks |
| `analysis_get_statistics` | Pattern statistics over N days |

### 5. Database Tables

**telegram_users** - Registered users
```sql
- id, phone_number, telegram_username, display_name, max_devices
```

**telegram_sessions** - Active login sessions (7-day expiry)
```sql
- id, user_id, telegram_user_id, telegram_chat_id, session_token, expires_at
```

**telegram_otp** - Pending OTP verifications (5-min expiry)
```sql
- id, phone_number, otp_code, telegram_user_id, expires_at, verified
```

## Authentication Flow

```
1. User registers phone at /register → telegram_users
2. User opens Telegram, types /login +60123456789
3. n8n generates OTP → telegram_otp table
4. OTP Bot sends code to user
5. User enters OTP → verified, session created
6. Subsequent messages check session before AI call
7. /logout clears session
```

## Environment Variables

**n8n:**
- `TELEGRAM_BOT_TOKEN` - Main bot token
- `TELEGRAM_OTP_BOT_TOKEN` - OTP bot token
- `AI_HUB_API_KEY` - AI Hub authentication

**MCP Server:**
- `DATABASE_URL` - PostgreSQL connection string
- `MCP_PORT` - Health check port (default: 8085)

## Deployment

| Component | Location | Method |
|-----------|----------|--------|
| Frontend | Vercel | Auto-deploy on push |
| AI Hub | VM (systemd) | GitHub Actions |
| MCP Server | VM (Docker) | GitHub Actions |
| n8n Workflow | n8n instance | Manual/MCP |

## Security Considerations

1. **Session tokens** - UUID-based, 7-day expiry
2. **OTP** - 6-digit code, 5-minute expiry, single use
3. **AI governance** - Strict system prompt prevents code execution
4. **API authentication** - X-API-Key header required
5. **Read-only DB** - MCP server only has SELECT permissions

