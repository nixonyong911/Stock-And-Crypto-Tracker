"""Telegram bot handlers package."""

from .commands import setup_command_handlers
from .messages import setup_message_handlers

__all__ = ["setup_command_handlers", "setup_message_handlers"]

