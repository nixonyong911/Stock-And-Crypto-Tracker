"""Configuration for Telegram Bot Service."""

import os

# Telegram Bot Token
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

# AI Hub Configuration
AI_HUB_URL = os.environ.get("AI_HUB_URL", "http://host.docker.internal:8084")
AI_HUB_API_KEY = os.environ.get("AI_HUB_API_KEY", "")
AI_HUB_ENDPOINT = "/cli/telegram-agent/cursor/sonnet-4.5"

# Database (Supabase) - Use DATABASE_URL_PYTHON for asyncpg DSN format
DATABASE_URL = os.environ.get("DATABASE_URL_PYTHON", os.environ.get("DATABASE_URL", ""))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

# Session Configuration
SESSION_EXPIRY_DAYS = 7

# Server Configuration
BOT_PORT = int(os.environ.get("BOT_PORT", "8087"))
WEBHOOK_URL = os.environ.get("WEBHOOK_URL", "")  # Optional: for webhook mode

