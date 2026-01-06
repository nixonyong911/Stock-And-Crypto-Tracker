#!/usr/bin/env python3
"""
Telegram Bot for Financial AI Assistant.

This bot allows authenticated users to chat with an AI agent
that can query financial data (stocks, crypto, candlestick patterns).
"""

import logging
import asyncio
from contextlib import asynccontextmanager

from telegram.ext import Application
from fastapi import FastAPI, Request, Response
import uvicorn

from config import TELEGRAM_BOT_TOKEN, BOT_PORT, WEBHOOK_URL
from services import SessionService, OTPService, AIHubClient
from handlers import setup_command_handlers, setup_message_handlers


# Configure logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)


# Global services
session_service = SessionService()
otp_service = OTPService()
ai_client = AIHubClient()
telegram_app: Application = None


async def setup_telegram_app():
    """Initialize the Telegram bot application."""
    global telegram_app
    
    if not TELEGRAM_BOT_TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set")
    
    # Build the application
    telegram_app = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .build()
    )
    
    # Store services in bot_data for handler access
    telegram_app.bot_data["session_service"] = session_service
    telegram_app.bot_data["otp_service"] = otp_service
    telegram_app.bot_data["ai_client"] = ai_client
    
    # Setup handlers
    setup_command_handlers(telegram_app)
    setup_message_handlers(telegram_app)
    
    # Initialize the application
    await telegram_app.initialize()
    
    return telegram_app


async def shutdown_services():
    """Clean up services on shutdown."""
    await session_service.close()
    await otp_service.close()
    if telegram_app:
        await telegram_app.shutdown()


# FastAPI app for webhook mode and health checks
@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan handler."""
    logger.info("Starting Telegram bot...")
    await setup_telegram_app()
    
    if WEBHOOK_URL:
        # Webhook mode
        logger.info(f"Setting webhook to {WEBHOOK_URL}")
        await telegram_app.bot.set_webhook(url=WEBHOOK_URL)
        await telegram_app.start()
    else:
        # Polling mode
        logger.info("Starting in polling mode...")
        await telegram_app.start()
        asyncio.create_task(telegram_app.updater.start_polling())
    
    yield
    
    logger.info("Shutting down...")
    if WEBHOOK_URL:
        await telegram_app.bot.delete_webhook()
    else:
        await telegram_app.updater.stop()
    await telegram_app.stop()
    await shutdown_services()


api = FastAPI(title="Telegram Bot API", lifespan=lifespan)


@api.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "telegram-bot",
        "ai_hub_connected": await ai_client.health_check()
    }


@api.post("/webhook")
async def webhook(request: Request):
    """Handle Telegram webhook updates."""
    if telegram_app:
        data = await request.json()
        update = telegram_app.update_queue.put_nowait(data)
        return Response(status_code=200)
    return Response(status_code=503)


@api.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Telegram Financial AI Bot",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "webhook": "/webhook"
        }
    }


def main():
    """Run the bot in polling mode (for local development)."""
    uvicorn.run(
        "main:api",
        host="0.0.0.0",
        port=BOT_PORT,
        reload=False
    )


if __name__ == "__main__":
    main()

