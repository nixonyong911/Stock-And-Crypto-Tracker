"""Session management service for Telegram bot authentication."""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import json
import re
from urllib.parse import quote_plus

import asyncpg

from config import DATABASE_URL, SESSION_EXPIRY_DAYS


def convert_connection_string_to_dsn(conn_str: str) -> str:
    """Convert .NET/ADO.NET connection string to PostgreSQL DSN format.
    
    Input:  User Id=user;Password=pass;Server=host;Port=5432;Database=db
    Output: postgresql://user:pass@host:5432/db
    """
    # If already a DSN, return as-is
    if conn_str.startswith(('postgresql://', 'postgres://')):
        return conn_str
    
    # Parse .NET connection string
    params = {}
    for part in conn_str.split(';'):
        if '=' in part:
            key, value = part.split('=', 1)
            params[key.strip().lower()] = value.strip()
    
    # Map .NET keys to DSN components
    user = params.get('user id', params.get('userid', params.get('user', '')))
    password = quote_plus(params.get('password', ''))
    host = params.get('server', params.get('host', 'localhost'))
    port = params.get('port', '5432')
    database = params.get('database', 'postgres')
    
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


# Convert connection string to DSN format
DATABASE_DSN = convert_connection_string_to_dsn(DATABASE_URL) if DATABASE_URL else ""


# Rate limit configuration
RATE_LIMITS = {
    "register": {"max_attempts": 3, "window_minutes": 60},
    "login": {"max_attempts": 5, "window_minutes": 15},
}


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""
    def __init__(self, action: str, retry_after_minutes: int):
        self.action = action
        self.retry_after_minutes = retry_after_minutes
        super().__init__(f"Rate limit exceeded for {action}. Retry after {retry_after_minutes} minutes.")


class SessionService:
    """Manages user registration and sessions for Telegram bot authentication."""
    
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None
    
    async def get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(DATABASE_DSN, min_size=2, max_size=10)
        return self._pool
    
    async def close(self):
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
    
    # ==================== Rate Limiting ====================
    
    async def check_rate_limit(self, telegram_user_id: int, action: str) -> None:
        """Check and update rate limit. Raises RateLimitExceeded if exceeded."""
        if action not in RATE_LIMITS:
            return
        
        config = RATE_LIMITS[action]
        max_attempts = config["max_attempts"]
        window_minutes = config["window_minutes"]
        
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            # Get current rate limit record
            row = await conn.fetchrow(
                """
                SELECT attempt_count, window_start 
                FROM telegram_rate_limits 
                WHERE telegram_user_id = $1 AND action_type = $2
                """,
                telegram_user_id, action
            )
            
            now = datetime.now(timezone.utc)
            window_start = now - timedelta(minutes=window_minutes)
            
            if row:
                # Check if window has expired
                if row["window_start"] < window_start:
                    # Reset the window
                    await conn.execute(
                        """
                        UPDATE telegram_rate_limits 
                        SET attempt_count = 1, window_start = $3
                        WHERE telegram_user_id = $1 AND action_type = $2
                        """,
                        telegram_user_id, action, now
                    )
                elif row["attempt_count"] >= max_attempts:
                    # Rate limit exceeded
                    time_passed = now - row["window_start"]
                    retry_after = window_minutes - int(time_passed.total_seconds() / 60)
                    raise RateLimitExceeded(action, max(1, retry_after))
                else:
                    # Increment attempt count
                    await conn.execute(
                        """
                        UPDATE telegram_rate_limits 
                        SET attempt_count = attempt_count + 1
                        WHERE telegram_user_id = $1 AND action_type = $2
                        """,
                        telegram_user_id, action
                    )
            else:
                # Create new rate limit record
                await conn.execute(
                    """
                    INSERT INTO telegram_rate_limits (telegram_user_id, action_type, attempt_count, window_start)
                    VALUES ($1, $2, 1, $3)
                    """,
                    telegram_user_id, action, now
                )
    
    async def get_user_by_telegram_id(self, telegram_user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by Telegram user ID."""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM telegram_users WHERE telegram_user_id = $1",
                telegram_user_id
            )
            return dict(row) if row else None
    
    async def create_user(
        self,
        telegram_user_id: int,
        display_name: str,
        telegram_username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new user. Returns the created user. Checks rate limit first."""
        # Check rate limit for registration
        await self.check_rate_limit(telegram_user_id, "register")
        
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO telegram_users (telegram_user_id, display_name, telegram_username)
                VALUES ($1, $2, $3)
                RETURNING *
                """,
                telegram_user_id,
                display_name,
                telegram_username
            )
            return dict(row)
    
    async def get_active_session(
        self, 
        telegram_user_id: int, 
        telegram_chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get active session for a Telegram user."""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT s.*, u.display_name, u.telegram_username
                FROM telegram_sessions s
                JOIN telegram_users u ON s.user_id = u.id
                WHERE s.telegram_user_id = $1 
                  AND s.telegram_chat_id = $2
                  AND s.expires_at > NOW()
                """,
                telegram_user_id,
                telegram_chat_id
            )
            return dict(row) if row else None
    
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
        
        pool = await self.get_pool()
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
        
        # Prepare device info JSON
        device_json = json.dumps(device_info) if device_info else "{}"
        
        async with pool.acquire() as conn:
            # Single-session policy: Delete ALL existing sessions for this user
            # (not just the same chat - invalidates all devices)
            await conn.execute(
                """
                DELETE FROM telegram_sessions 
                WHERE telegram_user_id = $1
                """,
                telegram_user_id
            )
            
            # Create new session with device info
            await conn.execute(
                """
                INSERT INTO telegram_sessions 
                (user_id, telegram_user_id, telegram_chat_id, expires_at, device_info)
                VALUES ($1, $2, $3, $4, $5::jsonb)
                """,
                user_id,
                telegram_user_id,
                telegram_chat_id,
                expires_at,
                device_json
            )
    
    async def delete_session(self, telegram_user_id: int, telegram_chat_id: int) -> bool:
        """Delete a session (logout)."""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM telegram_sessions 
                WHERE telegram_user_id = $1 AND telegram_chat_id = $2
                """,
                telegram_user_id,
                telegram_chat_id
            )
            return "DELETE" in result
    
    async def update_last_active(self, telegram_user_id: int, telegram_chat_id: int):
        """Update last active timestamp for a session."""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE telegram_sessions 
                SET last_active_at = NOW()
                WHERE telegram_user_id = $1 AND telegram_chat_id = $2
                """,
                telegram_user_id,
                telegram_chat_id
            )
