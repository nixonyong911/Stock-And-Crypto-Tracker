"""Message handlers for Telegram bot."""

import logging
from telegram import Update
from telegram.ext import ContextTypes, MessageHandler, filters

from services import SessionService, AIHubClient, RateLimitExceeded

logger = logging.getLogger(__name__)


def get_device_info(update: Update) -> dict:
    """Extract device info from Telegram update."""
    user = update.effective_user
    chat = update.effective_chat
    return {
        "language_code": user.language_code if user else None,
        "chat_type": chat.type if chat else None,
        "is_bot": user.is_bot if user else None,
    }


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle regular text messages."""
    session_service: SessionService = context.bot_data["session_service"]
    ai_client: AIHubClient = context.bot_data["ai_client"]
    
    telegram_user_id = update.effective_user.id
    telegram_chat_id = update.effective_chat.id
    message_text = update.message.text
    
    # Handle pending registration (Yes/No response)
    if context.user_data.get("pending_register"):
        text_lower = message_text.lower().strip()
        
        if text_lower in ["yes", "y"]:
            # Create user and session (includes rate limit check)
            try:
                user = await session_service.create_user(
                    telegram_user_id=telegram_user_id,
                    display_name=update.effective_user.first_name,
                    telegram_username=update.effective_user.username
                )
                
                # Auto-login after registration with device info
                device_info = get_device_info(update)
                await session_service.create_session(
                    user["id"],
                    telegram_user_id,
                    telegram_chat_id,
                    device_info
                )
                
                context.user_data.pop("pending_register", None)
                
                await update.message.reply_text(
                    f"✅ **Registration complete!**\n\n"
                    f"Welcome, {user['display_name']}! 🎉\n\n"
                    "You're now registered and logged in.\n\n"
                    "You can ask me financial questions. Try:\n"
                    "• \"What are today's bullish stocks?\"\n"
                    "• \"Show me pattern statistics for the week\"\n\n"
                    "Your session is valid for 7 days.",
                    parse_mode="Markdown"
                )
                return
            
            except RateLimitExceeded as e:
                context.user_data.pop("pending_register", None)
                await update.message.reply_text(
                    f"⚠️ Too many registration attempts.\n\n"
                    f"Please try again in {e.retry_after_minutes} minute(s).",
                    parse_mode="Markdown"
                )
                return
                
            except Exception as e:
                logger.error(f"Registration failed: {e}", exc_info=True)
                context.user_data.pop("pending_register", None)
                await update.message.reply_text(
                    "❌ Registration failed. Please try again later."
                )
                return
        
        elif text_lower in ["no", "n"]:
            context.user_data.pop("pending_register", None)
            await update.message.reply_text(
                "👋 Registration cancelled.\n\n"
                "Feel free to register anytime by sending /start!"
            )
            return
        
        else:
            # Invalid response, ask again
            await update.message.reply_text(
                "Please reply **Yes** or **No** to confirm registration.",
                parse_mode="Markdown"
            )
            return
    
    # Check for active session
    session = await session_service.get_active_session(telegram_user_id, telegram_chat_id)
    
    if not session:
        await update.message.reply_text(
            "🔒 **Please login first**\n\n"
            "Use /login to start a session.\n\n"
            "Not registered? Click the Register button on our website!",
            parse_mode="Markdown"
        )
        return
    
    # Update last active
    await session_service.update_last_active(telegram_user_id, telegram_chat_id)
    
    # Show typing indicator
    await update.effective_chat.send_action("typing")
    
    # Call AI Hub
    response = await ai_client.chat(message_text)
    
    # Send response (split if too long)
    max_length = 4000  # Telegram limit is 4096
    
    if len(response) <= max_length:
        await update.message.reply_text(response, parse_mode="Markdown")
    else:
        # Split into chunks
        chunks = [response[i:i+max_length] for i in range(0, len(response), max_length)]
        for chunk in chunks:
            await update.message.reply_text(chunk)


async def handle_unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle unknown commands."""
    await update.message.reply_text(
        "❓ Unknown command.\n"
        "Use /help to see available commands.",
        parse_mode="Markdown"
    )


def setup_message_handlers(application):
    """Register message handlers."""
    # Handle text messages (not commands)
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
    
    # Handle unknown commands
    application.add_handler(
        MessageHandler(filters.COMMAND, handle_unknown)
    )
