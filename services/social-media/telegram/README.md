# Telegram Financial AI Bot

A Telegram bot that allows authenticated users to chat with an AI agent for financial queries (stocks, crypto, candlestick patterns).

## Features

- **User Authentication**: Phone-based OTP login system
- **Session Management**: 7-day sessions with single-device limit
- **AI Integration**: Connects to AI Hub for financial queries
- **Rate Limiting**: Built-in protection against abuse

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and introduction |
| `/help` | Show available commands |
| `/login +phone` | Login with registered phone number |
| `/verify code` | Verify OTP code |
| `/logout` | End session |
| `/status` | Check login status |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Telegram  │────▶│  This Bot   │────▶│   AI Hub    │
│     User    │◀────│  (8087)     │◀────│   (8084)    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Supabase   │
                    │  (Sessions) │
                    └─────────────┘
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Main bot token from @BotFather | Yes |
| `TELEGRAM_OTP_BOT_TOKEN` | OTP bot token (future) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `AI_HUB_URL` | AI Hub base URL | Yes |
| `AI_HUB_API_KEY` | AI Hub API key | No |
| `BOT_PORT` | Server port (default: 8087) | No |
| `WEBHOOK_URL` | Webhook URL (if using webhook mode) | No |

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export TELEGRAM_BOT_TOKEN="your-token"
export DATABASE_URL="postgresql://..."
export AI_HUB_URL="http://localhost:8084"

# Run the bot
python main.py
```

## Docker

```bash
docker build -t telegram-bot .
docker run -p 8087:8087 \
  -e TELEGRAM_BOT_TOKEN=... \
  -e DATABASE_URL=... \
  -e AI_HUB_URL=... \
  telegram-bot
```

## Deployment

The bot runs on port 8087 and can operate in two modes:

1. **Polling Mode** (default): Bot polls Telegram for updates
2. **Webhook Mode**: Set `WEBHOOK_URL` for Telegram to push updates

## Database Tables

Required tables in Supabase:

- `telegram_users` - Registered users
- `telegram_sessions` - Active sessions
- `telegram_otp` - OTP verification records

See `instruction/database/schema.md` for table definitions.

## Security

- Users must register via web portal first
- OTP verification required for login
- Single device login limit (configurable)
- 7-day session expiry
- AI agent is governance-restricted (financial queries only)

