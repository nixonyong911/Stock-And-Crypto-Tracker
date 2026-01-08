"""Command handlers for Telegram bot."""

import logging
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler

from services import SessionService, RateLimitExceeded

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


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command.
    
    - New users: prompt Yes/No registration confirmation
    - Registered users: welcome message only (no prompts)
    """
    session_service: SessionService = context.bot_data["session_service"]
    user = update.effective_user
    
    # Check if user is already registered
    existing_user = await session_service.get_user_by_telegram_id(user.id)
    
    if existing_user:
        # Registered user: welcome message only
        await update.message.reply_text(
            f"👋 Welcome back, {existing_user['display_name']}!\n\n"
            "I'm your Financial AI Assistant. I can help you with:\n"
            "• Stock market analysis\n"
            "• Cryptocurrency information\n"
            "• Candlestick pattern interpretation\n"
            "• Market trends and statistics\n\n"
            "**Commands:**\n"
            "/login - Start a session\n"
            "/logout - End your session\n"
            "/status - Check your login status\n"
            "/help - Show this help message",
            parse_mode="Markdown"
        )
        return
    
    # New user: prompt for registration
    context.user_data["pending_register"] = True
    
    await update.message.reply_text(
        f"👋 Hi {user.first_name}!\n\n"
        "Welcome to **StockTracker Financial AI Assistant**!\n\n"
        "I can help you with stock analysis, crypto info, and candlestick patterns.\n\n"
        "Would you like to register?\n"
        "Reply **Yes** or **No**",
        parse_mode="Markdown"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    await update.message.reply_text(
        "🤖 **Financial AI Assistant Help**\n\n"
        "**Commands:**\n"
        "• /start - Welcome message\n"
        "• /login - Start a session\n"
        "• /logout - End your session\n"
        "• /status - Check login status\n\n"
        "**What I can help with:**\n"
        "• Stock analysis and patterns\n"
        "• Crypto market information\n"
        "• Candlestick pattern explanations\n"
        "• Market statistics\n\n"
        "**Example questions:**\n"
        "• \"What are today's bullish stocks?\"\n"
        "• \"Show me AAPL candlestick patterns\"\n"
        "• \"What patterns were detected this week?\"\n\n"
        "⚠️ I only answer financial questions.",
        parse_mode="Markdown"
    )


async def login_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /login command - create session if user is registered."""
    session_service: SessionService = context.bot_data["session_service"]
    
    telegram_user_id = update.effective_user.id
    telegram_chat_id = update.effective_chat.id
    
    # Check if already logged in
    session = await session_service.get_active_session(telegram_user_id, telegram_chat_id)
    if session:
        expires = session["expires_at"].strftime("%Y-%m-%d %H:%M UTC")
        await update.message.reply_text(
            f"✅ You're already logged in as **{session['display_name']}**.\n\n"
            f"Session expires: {expires}\n\n"
            "Use /logout if you want to end your session.",
            parse_mode="Markdown"
        )
        return
    
    # Check if user is registered
    user = await session_service.get_user_by_telegram_id(telegram_user_id)
    
    if not user:
        await update.message.reply_text(
            "❌ You're not registered yet.\n\n"
            "Send /start to register, or click the **Register** button on our website!",
            parse_mode="Markdown"
        )
        return
    
    # Create session with device info (includes rate limit check)
    try:
        device_info = get_device_info(update)
        await session_service.create_session(
            user["id"], telegram_user_id, telegram_chat_id, device_info
        )
    except RateLimitExceeded as e:
        await update.message.reply_text(
            f"⚠️ Too many login attempts.\n\n"
            f"Please try again in {e.retry_after_minutes} minute(s).",
            parse_mode="Markdown"
        )
        return
    
    await update.message.reply_text(
        f"✅ **Login successful!**\n\n"
        f"Welcome back, {user['display_name']}! 🎉\n\n"
        "You can now ask me financial questions. Try:\n"
        "• \"What are today's bullish stocks?\"\n"
        "• \"Show me pattern statistics for the week\"\n\n"
        "Your session is valid for 7 days.\n\n"
        "ℹ️ _Note: Logging in here will end any other active sessions._",
        parse_mode="Markdown"
    )


async def logout_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /logout command."""
    session_service: SessionService = context.bot_data["session_service"]
    
    telegram_user_id = update.effective_user.id
    telegram_chat_id = update.effective_chat.id
    
    deleted = await session_service.delete_session(telegram_user_id, telegram_chat_id)
    
    if deleted:
        await update.message.reply_text(
            "👋 You've been logged out successfully.\n\n"
            "Use /login to sign in again."
        )
    else:
        await update.message.reply_text(
            "ℹ️ You weren't logged in.\n\n"
            "Use /login to start a session."
        )


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command."""
    session_service: SessionService = context.bot_data["session_service"]
    
    telegram_user_id = update.effective_user.id
    telegram_chat_id = update.effective_chat.id
    
    # Check session
    session = await session_service.get_active_session(telegram_user_id, telegram_chat_id)
    
    if session:
        expires = session["expires_at"].strftime("%Y-%m-%d %H:%M UTC")
        await update.message.reply_text(
            f"✅ **Logged in**\n\n"
            f"👤 Name: {session['display_name']}\n"
            f"⏰ Expires: {expires}",
            parse_mode="Markdown"
        )
    else:
        # Check if registered but not logged in
        user = await session_service.get_user_by_telegram_id(telegram_user_id)
        if user:
            await update.message.reply_text(
                f"ℹ️ **Registered but not logged in**\n\n"
                f"👤 Name: {user['display_name']}\n\n"
                "Use /login to start a session.",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                "❌ **Not registered**\n\n"
                "Click the Register button on our website to get started!",
                parse_mode="Markdown"
            )


def setup_command_handlers(application):
    """Register all command handlers."""
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("login", login_command))
    application.add_handler(CommandHandler("logout", logout_command))
    application.add_handler(CommandHandler("status", status_command))
