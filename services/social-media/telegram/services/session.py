"""Session management service for Telegram bot authentication.

Uses DatabaseContext for database operations with Supavisor transaction mode.

Features:
- Rate limiting for registration and login
- Session management with expiry
- Single-session policy per user
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from .database import DatabaseContext

logger = logging.getLogger(__name__)


# Rate limit configuration
RATE_LIMITS = {
    "register": {"max_attempts": 3, "window_minutes": 60},
    "login": {"max_attempts": 5, "window_minutes": 15},
}

# Session expiry from config
SESSION_EXPIRY_DAYS = 7


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""
    def __init__(self, action: str, retry_after_minutes: int):
        self.action = action
        self.retry_after_minutes = retry_after_minutes
        super().__init__(f"Rate limit exceeded for {action}. Retry after {retry_after_minutes} minutes.")


class SessionService:
    """Manages user registration and sessions for Telegram bot authentication.
    
    Uses DatabaseContext for all database operations.
    """
    
    def __init__(self, db: DatabaseContext):
        """
        Initialize SessionService with a DatabaseContext.
        
        Args:
            db: DatabaseContext instance for database operations
        """
        self._db = db
    
    # ==================== Rate Limiting ====================
    
    async def check_rate_limit(self, telegram_user_id: int, action: str) -> None:
        """Check and update rate limit. Raises RateLimitExceeded if exceeded."""
        if action not in RATE_LIMITS:
            return
        
        config = RATE_LIMITS[action]
        max_attempts = config["max_attempts"]
        window_minutes = config["window_minutes"]
        
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=window_minutes)
        
        # Get current rate limit record
        row = await self._db.fetch_one(
            """
            SELECT attempt_count, window_start 
            FROM telegram_rate_limits 
            WHERE telegram_user_id = $1 AND action_type = $2
            """,
            telegram_user_id, action
        )
        
        if row:
            row_window_start = row["window_start"]
            if row_window_start.tzinfo is None:
                row_window_start = row_window_start.replace(tzinfo=timezone.utc)
            
            if row_window_start < window_start:
                # Reset the window
                await self._db.execute(
                    """
                    UPDATE telegram_rate_limits 
                    SET attempt_count = 1, window_start = $1
                    WHERE telegram_user_id = $2 AND action_type = $3
                    """,
                    now, telegram_user_id, action
                )
            elif row["attempt_count"] >= max_attempts:
                # Rate limit exceeded
                time_passed = now - row_window_start
                retry_after = window_minutes - int(time_passed.total_seconds() / 60)
                raise RateLimitExceeded(action, max(1, retry_after))
            else:
                # Increment attempt count
                await self._db.execute(
                    """
                    UPDATE telegram_rate_limits 
                    SET attempt_count = attempt_count + 1
                    WHERE telegram_user_id = $1 AND action_type = $2
                    """,
                    telegram_user_id, action
                )
        else:
            # Create new rate limit record
            await self._db.execute(
                """
                INSERT INTO telegram_rate_limits (telegram_user_id, action_type, attempt_count, window_start)
                VALUES ($1, $2, 1, $3)
                """,
                telegram_user_id, action, now
            )
    
    async def get_user_by_telegram_id(self, telegram_user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by Telegram user ID."""
        return await self._db.fetch_one(
            "SELECT * FROM telegram_users WHERE telegram_user_id = $1",
            telegram_user_id
        )
    
    async def create_user(
        self,
        telegram_user_id: int,
        display_name: str,
        telegram_username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new user. Returns the created user. Checks rate limit first."""
        # Check rate limit for registration
        await self.check_rate_limit(telegram_user_id, "register")
        
        row = await self._db.fetch_one(
            """
            INSERT INTO telegram_users (telegram_user_id, display_name, telegram_username)
            VALUES ($1, $2, $3)
            RETURNING *
            """,
            telegram_user_id, display_name, telegram_username
        )
        if row:
            return row
        raise Exception("Failed to create user")
    
    async def get_active_session(
        self, 
        telegram_user_id: int, 
        telegram_chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get active session for a Telegram user."""
        now = datetime.now(timezone.utc)
        
        # Get session with user info using a JOIN
        return await self._db.fetch_one(
            """
            SELECT s.*, u.display_name, u.telegram_username
            FROM telegram_sessions s
            JOIN telegram_users u ON s.user_id = u.id
            WHERE s.telegram_user_id = $1 
              AND s.telegram_chat_id = $2 
              AND s.expires_at > $3
            """,
            telegram_user_id, telegram_chat_id, now
        )
    
    async def create_session(
        self,
        user_id: int,
        telegram_user_id: int,
        telegram_chat_id: int,
        device_info: Optional[Dict[str, Any]] = None
    ) -> None:
        """Create a new session for a user.
        
        Implements single-session policy: all existing sessions for this user
        are invalidated when a new session is created.
        """
        # Check rate limit for login
        await self.check_rate_limit(telegram_user_id, "login")
        
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
        
        # Use a transaction for atomicity
        async with self._db.transaction() as conn:
            # Single-session policy: Delete ALL existing sessions for this user
            await conn.execute(
                "DELETE FROM telegram_sessions WHERE telegram_user_id = $1",
                telegram_user_id
            )
            
            # Create new session with device info
            await conn.execute(
                """
                INSERT INTO telegram_sessions 
                    (user_id, telegram_user_id, telegram_chat_id, expires_at, device_info)
                VALUES ($1, $2, $3, $4, $5)
                """,
                user_id, telegram_user_id, telegram_chat_id, expires_at,
                device_info if device_info else {}
            )
    
    async def delete_session(self, telegram_user_id: int, telegram_chat_id: int) -> bool:
        """Delete a session (logout)."""
        result = await self._db.execute(
            """
            DELETE FROM telegram_sessions 
            WHERE telegram_user_id = $1 AND telegram_chat_id = $2
            """,
            telegram_user_id, telegram_chat_id
        )
        # Result format: "DELETE n" where n is rows affected
        return result.split()[-1] != "0"
    
    async def update_last_active(self, telegram_user_id: int, telegram_chat_id: int):
        """Update last active timestamp for a session."""
        now = datetime.now(timezone.utc)
        await self._db.execute(
            """
            UPDATE telegram_sessions 
            SET last_active_at = $1
            WHERE telegram_user_id = $2 AND telegram_chat_id = $3
            """,
            now, telegram_user_id, telegram_chat_id
        )
