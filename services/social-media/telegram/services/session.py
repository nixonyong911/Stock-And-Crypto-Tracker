"""Session management service for Telegram bot authentication."""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import asyncpg

from config import DATABASE_URL, SESSION_EXPIRY_DAYS


class SessionService:
    """Manages user registration and sessions for Telegram bot authentication."""
    
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None
    
    async def get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        return self._pool
    
    async def close(self):
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
    
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
        """Create a new user. Returns the created user."""
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
        telegram_chat_id: int
    ) -> None:
        """Create a new session for a user."""
        pool = await self.get_pool()
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
        
        async with pool.acquire() as conn:
            # Delete existing session for this telegram user/chat if exists
            await conn.execute(
                """
                DELETE FROM telegram_sessions 
                WHERE telegram_user_id = $1 AND telegram_chat_id = $2
                """,
                telegram_user_id,
                telegram_chat_id
            )
            
            # Create new session
            await conn.execute(
                """
                INSERT INTO telegram_sessions 
                (user_id, telegram_user_id, telegram_chat_id, expires_at)
                VALUES ($1, $2, $3, $4)
                """,
                user_id,
                telegram_user_id,
                telegram_chat_id,
                expires_at
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
