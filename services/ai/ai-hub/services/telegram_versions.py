"""
Telegram Agent Version Handlers

This module contains versioned implementations of the telegram agent logic.
Use this pattern to test new features in the test endpoint before promoting to production.

Promotion workflow:
1. Develop new features in the latest version (e.g., v2)
2. Test endpoint uses the latest version
3. When ready, update production endpoint to use the new version
4. Create next version (e.g., v3) for continued development
"""

from dataclasses import dataclass
from typing import Optional

from services.cli_executor import CLIResult


@dataclass
class TelegramAgentResult:
    """Result from telegram agent execution."""
    success: bool
    output: str
    error: Optional[str] = None
    exit_code: int = 0


async def telegram_agent_v1(message: str, config, executor) -> CLIResult:
    """
    Version 1 - Current stable production implementation.
    
    Uses cursor-agent with sonnet-4.5 model.
    
    Args:
        message: The user's message
        config: Application config instance
        executor: CLI executor instance
        
    Returns:
        CLIResult with output or error
    """
    return await executor.execute(
        cli="cursor-agent",
        message=message,
        context_path=config.settings.ai_hub_default_context_path,
        model="sonnet-4.5"
    )


async def telegram_agent_v2(message: str, config, executor) -> CLIResult:
    """
    Version 2 - Testing/development version.
    
    Currently identical to v1. Modify this version for testing new features.
    Once testing is complete, promote by updating production endpoint to use v2.
    
    Args:
        message: The user's message
        config: Application config instance
        executor: CLI executor instance
        
    Returns:
        CLIResult with output or error
    """
    return await executor.execute(
        cli="cursor-agent",
        message=message,
        context_path=config.settings.ai_hub_default_context_path,
        model="sonnet-4.5"
    )
