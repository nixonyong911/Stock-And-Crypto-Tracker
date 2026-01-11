# Telegram AI Bot Architecture

## Overview

A Telegram bot that allows authenticated users to interact with an AI financial assistant. The system includes user registration with Yes/No confirmation, session-based authentication with single-device policy, rate limiting, and governed AI responses for financial/stock/crypto queries.

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
│   │ (Docker, Port 8080) │◀────────────▶│    (Docker, Port 8085)      │      │
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

### 1. Frontend Registration Button (`services/frontend/src/components/Header.tsx`)

A button in the frontend header that links to Telegram via deep link for registration.

**Flow:**
- Button links to `https://t.me/BotName?start=register`
- Opens Telegram and triggers /start command
- Bot prompts Yes/No registration confirmation

### 2. Telegram Bot Service (`services/social-media/telegram/`)

Python-based Telegram bot service that handles user interactions directly.

**Key Files:**
- `main.py` - Application entry point, FastAPI health server
- `config.py` - Environment configuration
- `handlers/commands.py` - /start, /login, /logout, /status, /help
- `handlers/messages.py` - AI query handling, registration flow
- `services/session.py` - Session management, rate limiting
- `services/ai_hub.py` - AI Hub API client

**Commands:**
| Command | Description |
|---------|-------------|
| /start | Welcome + registration prompt for new users |
| /login | Create session (invalidates other devices) |
| /logout | End current session |
| /status | Check login status |
| /help | Show available commands |

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
- id, telegram_user_id, display_name, telegram_username, created_at
```

**telegram_sessions** - Active login sessions (7-day expiry)
```sql
- id, user_id, telegram_user_id, telegram_chat_id, expires_at, 
  device_info (JSONB), session_token (UUID), last_active_at
```

**telegram_rate_limits** - Rate limiting for registration/login
```sql
- id, telegram_user_id, action_type, attempt_count, window_start
```

## Authentication Flow

```
Registration (New User):
1. User clicks "Register for Telegram Bot" button on frontend
2. Deep link opens Telegram with /start command
3. Bot detects new user, prompts "Register? Yes/No"
4. User replies Yes → telegram_users record created
5. Auto-login: session created with device info
6. User can now ask financial questions

Returning User:
1. User sends /start
2. Bot detects existing user, shows welcome message
3. User sends /login to start session
4. Session created (invalidates any other active sessions)

Session Rules:
- Sessions expire after 7 days
- Single-session policy: new login invalidates all other devices
- Rate limits: 3 registration attempts/hour, 5 login attempts/15 min
```

## Environment Variables

**Telegram Bot Service:**
- `TELEGRAM_BOT_TOKEN` - Main bot token from @BotFather
- `DATABASE_URL_PYTHON` - PostgreSQL DSN for asyncpg (Session Pooler format)
- `AI_HUB_URL` - AI Hub endpoint (default: `http://ai-hub-docker:8080`)
- `AI_HUB_API_KEY` - AI Hub authentication

**MCP Server:**
- `DATABASE_URL` - PostgreSQL connection string (.NET format)
- `MCP_PORT` - Health check port (default: 8085)

### Database Connection Formats

| Service | Format | Example |
|---------|--------|---------|
| .NET Workers | ADO.NET | `User Id=postgres.xxx;Password=...;Server=pooler.supabase.com;Port=6543` |
| Python (asyncpg) | PostgreSQL DSN | `postgresql://postgres.xxx:pass@pooler.supabase.com:5432/postgres` |

**Supabase Pooler Options:**
- **Session Pooler** (port 5432) - For persistent connections, IPv4 compatible
- **Transaction Pooler** (port 6543) - For serverless/stateless apps

**Note:** URL-encode special characters in passwords (`*` → `%2A`)

## Deployment

| Component | Location | Method |
|-----------|----------|--------|
| Frontend | Vercel | Auto-deploy on push |
| AI Hub | VM (Docker) | GitHub Actions |
| MCP Server | VM (Docker) | GitHub Actions |
| Telegram Bot | VM (Docker) | GitHub Actions |

## Security Considerations

1. **Session tokens** - UUID-based, 7-day expiry
2. **Single-session policy** - New login invalidates all other active sessions
3. **Rate limiting** - Registration: 3/hour, Login: 5/15min per user
4. **Device tracking** - Sessions store language_code, chat_type for audit
5. **AI governance** - Strict system prompt prevents code execution
6. **API authentication** - X-API-Key header required
7. **Read-only DB** - MCP server only has SELECT permissions
8. **Telegram ID immutability** - User identity tied to telegram_user_id (cannot be spoofed)

## Security Threats & Mitigations

| Threat | Risk | Mitigation |
|--------|------|------------|
| DDoS via /start spam | High | Rate limit: 3 reg/hour, 5 login/15min |
| Session hijacking | Medium | Sessions tied to immutable telegram_user_id |
| Impersonation | Low | Telegram API guarantees user.id authenticity |
| Session persistence attack | Medium | Single-session policy; victim's login kills attacker's session |
| Bot token leak | High | Store in Infisical; rotate if suspected leak |

