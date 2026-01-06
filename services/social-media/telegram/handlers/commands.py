"""Command handlers for Telegram bot."""

import re
import logging
from telegram import Update
from telegram.ext import ContextTypes, CommandHandler

from services import SessionService, OTPService

logger = logging.getLogger(__name__)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    user = update.effective_user
    await update.message.reply_text(
        f"👋 Welcome {user.first_name}!\n\n"
        "I'm your Financial AI Assistant. I can help you with:\n"
        "• Stock market analysis\n"
        "• Cryptocurrency information\n"
        "• Candlestick pattern interpretation\n"
        "• Market trends and statistics\n\n"
        "Commands:\n"
        "/login <phone> - Login with your registered phone\n"
        "/logout - End your session\n"
        "/status - Check your login status\n"
        "/help - Show this help message\n\n"
        "📝 First time? Register at the web portal first, then use /login here."
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /help command."""
    await update.message.reply_text(
        "🤖 Financial AI Assistant Help\n\n"
        "Commands:\n"
        "• /start - Welcome message\n"
        "• /login 0123456789 - Login with phone number\n"
        "• /verify 123456 - Verify OTP code\n"
        "• /logout - End your session\n"
        "• /status - Check login status\n\n"
        "What I can help with:\n"
        "• Stock analysis and patterns\n"
        "• Crypto market information\n"
        "• Candlestick pattern explanations\n"
        "• Market statistics\n\n"
        "Example questions:\n"
        "• \"What are today's bullish stocks?\"\n"
        "• \"Show me AAPL candlestick patterns\"\n"
        "• \"What patterns were detected this week?\"\n\n"
        "⚠️ I only answer financial questions."
    )


def normalize_phone(phone: str) -> str:
    """
    Normalize phone number to +60 format (Malaysia).
    Examples:
      0123456789 -> +60123456789
      60123456789 -> +60123456789
      +60123456789 -> +60123456789
      123456789 -> +60123456789
    """
    # Remove spaces, dashes, parentheses
    phone = re.sub(r'[\s\-\(\)]', '', phone)
    
    # If starts with +, keep as is
    if phone.startswith('+'):
        return phone
    
    # If starts with 60, add +
    if phone.startswith('60'):
        return '+' + phone
    
    # If starts with 0, replace with +60
    if phone.startswith('0'):
        return '+60' + phone[1:]
    
    # Otherwise assume Malaysia, add +60
    return '+60' + phone


async def login_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /login command."""
    await update.message.reply_text("⏳ Processing...")
    
    try:
        session_service: SessionService = context.bot_data["session_service"]
        otp_service: OTPService = context.bot_data["otp_service"]
        
        user_id = update.effective_user.id
        chat_id = update.effective_chat.id
        
        # Check if already logged in
        try:
            session = await session_service.get_active_session(user_id, chat_id)
            if session:
                await update.message.reply_text(
                    f"✅ You're already logged in as {session['display_name']}.\n"
                    "Use /logout first if you want to switch accounts."
                )
                return
        except Exception as e:
            logger.error(f"Session check failed: {e}")
            # Continue to login flow even if session check fails
        
        # Parse phone number from command
        if not context.args:
            await update.message.reply_text(
                "📱 Please provide your phone number:\n"
                "/login 0123456789\n\n"
                "You can use formats like:\n"
                "• 0123456789\n"
                "• +60123456789\n"
                "• 60123456789"
            )
            return
        
        raw_phone = context.args[0]
        phone_number = normalize_phone(raw_phone)
        
        logger.info(f"Login attempt: {raw_phone} -> {phone_number}")
        
        # Check if user exists in database
        try:
            user = await session_service.get_user_by_phone(phone_number)
        except Exception as e:
            logger.error(f"Database error checking user: {e}")
            await update.message.reply_text(
                "⚠️ Database connection error.\n"
                "Please try again later."
            )
            return
        
        if not user:
            await update.message.reply_text(
                f"❌ Phone {phone_number} not registered.\n\n"
                "Please register at the web portal first:\n"
                "https://stock-tracker-frontend.vercel.app/register"
            )
            return
        
        # Generate and store OTP
        try:
            otp_code = await otp_service.create_otp(phone_number, user_id, chat_id)
        except Exception as e:
            logger.error(f"OTP creation failed: {e}")
            await update.message.reply_text(
                "⚠️ Failed to generate OTP.\n"
                "Please try again."
            )
            return
        
        # Store phone in user context for verification
        context.user_data["pending_phone"] = phone_number
        context.user_data["pending_user_id"] = user["id"]
        
        # Show OTP (in production, send via second bot)
        await update.message.reply_text(
            f"📨 OTP sent!\n\n"
            f"Your verification code is: {otp_code}\n\n"
            f"Use /verify {otp_code} to complete login.\n"
            f"Code expires in 5 minutes."
        )
        
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        await update.message.reply_text(
            f"❌ Error during login: {str(e)[:100]}\n"
            "Please try again."
        )


async def verify_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /verify command for OTP verification."""
    await update.message.reply_text("⏳ Verifying...")
    
    try:
        session_service: SessionService = context.bot_data["session_service"]
        otp_service: OTPService = context.bot_data["otp_service"]
        
        user_id = update.effective_user.id
        chat_id = update.effective_chat.id
        
        # Check for pending login
        phone_number = context.user_data.get("pending_phone")
        db_user_id = context.user_data.get("pending_user_id")
        
        if not phone_number:
            await update.message.reply_text(
                "❌ No pending login.\n"
                "Use /login <phone> first."
            )
            return
        
        # Parse OTP from command
        if not context.args:
            await update.message.reply_text(
                "Please provide the OTP code:\n"
                "/verify 123456"
            )
            return
        
        otp_code = context.args[0]
        
        # Verify OTP
        try:
            otp_record = await otp_service.verify_otp(phone_number, otp_code, user_id)
        except Exception as e:
            logger.error(f"OTP verification failed: {e}")
            await update.message.reply_text(
                "⚠️ Verification error. Please try again."
            )
            return
        
        if not otp_record:
            await update.message.reply_text(
                "❌ Invalid or expired OTP code.\n"
                "Please try /login again."
            )
            return
        
        # Create session
        try:
            device_name = f"Telegram ({update.effective_user.first_name})"
            await session_service.create_session(db_user_id, user_id, chat_id, device_name)
        except Exception as e:
            logger.error(f"Session creation failed: {e}")
            await update.message.reply_text(
                "⚠️ Failed to create session. Please try again."
            )
            return
        
        # Clear pending data
        context.user_data.pop("pending_phone", None)
        context.user_data.pop("pending_user_id", None)
        
        # Get user info for welcome
        user = await session_service.get_user_by_phone(phone_number)
        display_name = user["display_name"] if user else "User"
        
        await update.message.reply_text(
            f"✅ Login successful!\n\n"
            f"Welcome, {display_name}! 🎉\n\n"
            f"You can now ask me financial questions. Try:\n"
            f"• \"What are today's bullish stocks?\"\n"
            f"• \"Show me pattern statistics for the week\"\n\n"
            f"Your session is valid for 7 days."
        )
        
    except Exception as e:
        logger.error(f"Verify error: {e}", exc_info=True)
        await update.message.reply_text(
            f"❌ Verification error: {str(e)[:100]}"
        )


async def logout_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /logout command."""
    await update.message.reply_text("⏳ Logging out...")
    
    try:
        session_service: SessionService = context.bot_data["session_service"]
        
        user_id = update.effective_user.id
        chat_id = update.effective_chat.id
        
        deleted = await session_service.delete_session(user_id, chat_id)
        
        if deleted:
            await update.message.reply_text(
                "👋 You've been logged out successfully.\n"
                "Use /login to sign in again."
            )
        else:
            await update.message.reply_text(
                "ℹ️ You weren't logged in.\n"
                "Use /login <phone> to sign in."
            )
            
    except Exception as e:
        logger.error(f"Logout error: {e}", exc_info=True)
        await update.message.reply_text(
            f"❌ Logout error: {str(e)[:100]}"
        )


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /status command."""
    await update.message.reply_text("⏳ Checking status...")
    
    try:
        session_service: SessionService = context.bot_data["session_service"]
        
        user_id = update.effective_user.id
        chat_id = update.effective_chat.id
        
        session = await session_service.get_active_session(user_id, chat_id)
        
        if session:
            expires = session["expires_at"].strftime("%Y-%m-%d %H:%M UTC")
            await update.message.reply_text(
                f"✅ Logged in\n\n"
                f"👤 Name: {session['display_name']}\n"
                f"📱 Phone: {session['phone_number']}\n"
                f"⏰ Expires: {expires}"
            )
        else:
            await update.message.reply_text(
                "❌ Not logged in\n\n"
                "Use /login <phone> to sign in."
            )
            
    except Exception as e:
        logger.error(f"Status error: {e}", exc_info=True)
        await update.message.reply_text(
            f"❌ Status check failed: {str(e)[:100]}\n\n"
            "Database may be unavailable."
        )


def setup_command_handlers(application):
    """Register all command handlers."""
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("login", login_command))
    application.add_handler(CommandHandler("verify", verify_command))
    application.add_handler(CommandHandler("logout", logout_command))
    application.add_handler(CommandHandler("status", status_command))
