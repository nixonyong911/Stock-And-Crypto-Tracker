"""Command handlers for Telegram bot."""

import re
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler

from services import SessionService, OTPService


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    user = update.effective_user
    await update.message.reply_text(
        f"👋 Welcome {user.first_name}!\n\n"
        "I'm your **Financial AI Assistant**. I can help you with:\n"
        "• Stock market analysis\n"
        "• Cryptocurrency information\n"
        "• Candlestick pattern interpretation\n"
        "• Market trends and statistics\n\n"
        "**Commands:**\n"
        "/login <phone> - Login with your registered phone\n"
        "/logout - End your session\n"
        "/status - Check your login status\n"
        "/help - Show this help message\n\n"
        "📝 **First time?** Register at the web portal first, then use /login here.",
        parse_mode="Markdown"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    await update.message.reply_text(
        "🤖 **Financial AI Assistant Help**\n\n"
        "**Commands:**\n"
        "• `/start` - Welcome message\n"
        "• `/login +60123456789` - Login with phone number\n"
        "• `/verify 123456` - Verify OTP code\n"
        "• `/logout` - End your session\n"
        "• `/status` - Check login status\n\n"
        "**What I can help with:**\n"
        "• Stock analysis and patterns\n"
        "• Crypto market information\n"
        "• Candlestick pattern explanations\n"
        "• Market statistics\n\n"
        "**Example questions:**\n"
        "• \"What are today's bullish stocks?\"\n"
        "• \"Show me AAPL candlestick patterns\"\n"
        "• \"What patterns were detected this week?\"\n\n"
        "⚠️ I only answer financial questions. I cannot run commands or access code.",
        parse_mode="Markdown"
    )


async def login_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /login command."""
    session_service: SessionService = context.bot_data["session_service"]
    otp_service: OTPService = context.bot_data["otp_service"]
    
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    # Check if already logged in
    session = await session_service.get_active_session(user_id, chat_id)
    if session:
        await update.message.reply_text(
            f"✅ You're already logged in as **{session['display_name']}**.\n"
            "Use /logout first if you want to switch accounts.",
            parse_mode="Markdown"
        )
        return
    
    # Parse phone number from command
    if not context.args:
        await update.message.reply_text(
            "📱 Please provide your phone number:\n"
            "`/login +60123456789`\n\n"
            "Include your country code (e.g., +60 for Malaysia, +1 for US)",
            parse_mode="Markdown"
        )
        return
    
    phone_number = context.args[0]
    
    # Validate phone number format
    if not re.match(r'^\+\d{7,20}$', phone_number):
        await update.message.reply_text(
            "❌ Invalid phone number format.\n"
            "Please use: `/login +60123456789`",
            parse_mode="Markdown"
        )
        return
    
    # Check if user exists
    user = await session_service.get_user_by_phone(phone_number)
    if not user:
        await update.message.reply_text(
            "❌ Phone number not registered.\n"
            "Please register at the web portal first.",
            parse_mode="Markdown"
        )
        return
    
    # Generate and store OTP
    otp_code = await otp_service.create_otp(phone_number, user_id, chat_id)
    
    # Store phone in user context for verification
    context.user_data["pending_phone"] = phone_number
    context.user_data["pending_user_id"] = user["id"]
    
    # In production, send OTP via second bot
    # For now, show it (remove in production!)
    await update.message.reply_text(
        f"📨 OTP sent!\n\n"
        f"Your verification code is: `{otp_code}`\n\n"
        f"Use `/verify {otp_code}` to complete login.\n"
        f"Code expires in 5 minutes.",
        parse_mode="Markdown"
    )
    
    # TODO: Send OTP via second Telegram bot
    # otp_bot = context.bot_data.get("otp_bot")
    # if otp_bot:
    #     await otp_bot.send_message(chat_id, f"Your OTP: {otp_code}")


async def verify_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /verify command for OTP verification."""
    session_service: SessionService = context.bot_data["session_service"]
    otp_service: OTPService = context.bot_data["otp_service"]
    
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    # Check for pending login
    phone_number = context.user_data.get("pending_phone")
    db_user_id = context.user_data.get("pending_user_id")
    
    if not phone_number:
        await update.message.reply_text(
            "❌ No pending login. Use `/login +phone` first.",
            parse_mode="Markdown"
        )
        return
    
    # Parse OTP from command
    if not context.args:
        await update.message.reply_text(
            "Please provide the OTP code:\n"
            "`/verify 123456`",
            parse_mode="Markdown"
        )
        return
    
    otp_code = context.args[0]
    
    # Verify OTP
    otp_record = await otp_service.verify_otp(phone_number, otp_code, user_id)
    
    if not otp_record:
        await update.message.reply_text(
            "❌ Invalid or expired OTP code.\n"
            "Please try `/login` again.",
            parse_mode="Markdown"
        )
        return
    
    # Create session
    device_name = f"Telegram ({update.effective_user.first_name})"
    await session_service.create_session(db_user_id, user_id, chat_id, device_name)
    
    # Clear pending data
    context.user_data.pop("pending_phone", None)
    context.user_data.pop("pending_user_id", None)
    
    # Get user info for welcome
    user = await session_service.get_user_by_phone(phone_number)
    display_name = user["display_name"] if user else "User"
    
    await update.message.reply_text(
        f"✅ **Login successful!**\n\n"
        f"Welcome, {display_name}! 🎉\n\n"
        f"You can now ask me financial questions. Try:\n"
        f"• \"What are today's bullish stocks?\"\n"
        f"• \"Show me pattern statistics for the week\"\n\n"
        f"Your session is valid for 7 days.",
        parse_mode="Markdown"
    )


async def logout_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /logout command."""
    session_service: SessionService = context.bot_data["session_service"]
    
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    deleted = await session_service.delete_session(user_id, chat_id)
    
    if deleted:
        await update.message.reply_text(
            "👋 You've been logged out successfully.\n"
            "Use `/login` to sign in again.",
            parse_mode="Markdown"
        )
    else:
        await update.message.reply_text(
            "ℹ️ You weren't logged in.\n"
            "Use `/login +phone` to sign in.",
            parse_mode="Markdown"
        )


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command."""
    session_service: SessionService = context.bot_data["session_service"]
    
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    session = await session_service.get_active_session(user_id, chat_id)
    
    if session:
        expires = session["expires_at"].strftime("%Y-%m-%d %H:%M UTC")
        await update.message.reply_text(
            f"✅ **Logged in**\n\n"
            f"👤 Name: {session['display_name']}\n"
            f"📱 Phone: {session['phone_number']}\n"
            f"⏰ Expires: {expires}",
            parse_mode="Markdown"
        )
    else:
        await update.message.reply_text(
            "❌ **Not logged in**\n\n"
            "Use `/login +phone` to sign in.",
            parse_mode="Markdown"
        )


def setup_command_handlers(application):
    """Register all command handlers."""
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("login", login_command))
    application.add_handler(CommandHandler("verify", verify_command))
    application.add_handler(CommandHandler("logout", logout_command))
    application.add_handler(CommandHandler("status", status_command))

