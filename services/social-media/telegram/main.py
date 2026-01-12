#!/usr/bin/env python3
"""
Telegram Bot for Financial AI Assistant.

This bot allows authenticated users to chat with an AI agent
that can query financial data (stocks, crypto, candlestick patterns).
"""

import logging
import asyncio
import sys
from threading import Thread

from telegram.ext import Application
from fastapi import FastAPI
import uvicorn

from config import TELEGRAM_BOT_TOKEN, BOT_PORT, DATABASE_URL
from services import DatabaseContext, SessionService, AIHubClient
from handlers import setup_command_handlers, setup_message_handlers


# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)


# Infrastructure layer
db_context = DatabaseContext(DATABASE_URL)

# Services (with dependency injection)
session_service = SessionService(db_context)
ai_client = AIHubClient()

# Telegram application
telegram_app: Application = None


# FastAPI for health checks only
api = FastAPI(title="Telegram Bot Health API")


@api.get("/health")
async def health_check():
    """Health check endpoint."""
    bot_running = telegram_app is not None
    return {
        "status": "healthy" if bot_running else "starting",
        "service": "telegram-bot",
        "bot_running": bot_running
    }


@api.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Telegram Financial AI Bot",
        "version": "1.0.0",
        "status": "running"
    }


def run_health_server():
    """Run FastAPI health server in a separate thread."""
    uvicorn.run(api, host="0.0.0.0", port=BOT_PORT, log_level="warning")


async def main():
    """Main entry point - run the Telegram bot."""
    global telegram_app
    
    logger.info("=" * 50)
    logger.info("Starting Telegram Financial AI Bot")
    logger.info("=" * 50)
    
    # Validate token
    if not TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set!")
        sys.exit(1)
    
    logger.info(f"Token found: {TELEGRAM_BOT_TOKEN[:10]}...")
    
    # Build the application
    telegram_app = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .build()
    )
    
    # Store services in bot_data for handler access
    telegram_app.bot_data["session_service"] = session_service
    telegram_app.bot_data["ai_client"] = ai_client
    
    # Setup handlers
    logger.info("Setting up command handlers...")
    setup_command_handlers(telegram_app)
    setup_message_handlers(telegram_app)
    logger.info("Handlers registered: /start, /help, /login, /logout, /status")
    
    # Start health server in background thread
    logger.info(f"Starting health server on port {BOT_PORT}...")
    health_thread = Thread(target=run_health_server, daemon=True)
    health_thread.start()
    
    # Initialize and start bot (async-friendly approach)
    logger.info("Starting bot polling...")
    
    try:
        # Initialize the application
        await telegram_app.initialize()
        
        # Start the updater (polling)
        await telegram_app.updater.start_polling(
            drop_pending_updates=True,
            allowed_updates=["message", "callback_query"]
        )
        
        # Start the application
        await telegram_app.start()
        
        logger.info("Bot is now running! Send /start to test.")
        
        # Keep running until interrupted
        stop_event = asyncio.Event()
        await stop_event.wait()
        
    except asyncio.CancelledError:
        logger.info("Bot received shutdown signal")
    except Exception as e:
        logger.error(f"Bot polling error: {e}", exc_info=True)
    finally:
        logger.info("Shutting down bot...")
        if telegram_app.updater.running:
            await telegram_app.updater.stop()
        if telegram_app.running:
            await telegram_app.stop()
        await telegram_app.shutdown()
        logger.info("Bot stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
