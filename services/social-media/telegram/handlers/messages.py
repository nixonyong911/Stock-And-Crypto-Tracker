"""Message handlers for Telegram bot."""

from telegram import Update
from telegram.ext import ContextTypes, MessageHandler, filters

from services import SessionService, AIHubClient


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle regular text messages."""
    session_service: SessionService = context.bot_data["session_service"]
    ai_client: AIHubClient = context.bot_data["ai_client"]
    
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    message_text = update.message.text
    
    # Check for active session
    session = await session_service.get_active_session(user_id, chat_id)
    
    if not session:
        await update.message.reply_text(
            "🔒 **Please login first**\n\n"
            "Use `/login +phone` with your registered phone number.\n\n"
            "Not registered? Visit the web portal to create an account.",
            parse_mode="Markdown"
        )
        return
    
    # Update last active
    await session_service.update_last_active(user_id, chat_id)
    
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

