"""Session management service for Telegram bot authentication.

Uses Supabase Python Client (REST API) instead of direct Postgres connection
to avoid DNS resolution issues in Docker containers.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY, SESSION_EXPIRY_DAYS

logger = logging.getLogger(__name__)


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


class DatabaseConnectionError(Exception):
    """Raised when database connection fails."""
    pass


class SessionService:
    """Manages user registration and sessions for Telegram bot authentication.
    
    Uses Supabase REST API for database operations, which is more resilient
    than direct Postgres connections in containerized environments.
    """
    
    def __init__(self):
        self._client: Optional[Client] = None
    
    def _get_client(self) -> Client:
        """Get or create Supabase client."""
        if self._client is None:
            if not SUPABASE_URL or not SUPABASE_KEY:
                raise DatabaseConnectionError("SUPABASE_URL and SUPABASE_KEY must be configured")
            
            try:
                self._client = create_client(SUPABASE_URL, SUPABASE_KEY)
                logger.info("Supabase client created successfully")
            except Exception as e:
                logger.error(f"Failed to create Supabase client: {e}")
                raise DatabaseConnectionError(f"Failed to create Supabase client: {e}")
        
        return self._client
    
    async def close(self):
        """Close the client (no-op for REST client, kept for interface compatibility)."""
        self._client = None
    
    # ==================== Rate Limiting ====================
    
    async def check_rate_limit(self, telegram_user_id: int, action: str) -> None:
        """Check and update rate limit. Raises RateLimitExceeded if exceeded."""
        if action not in RATE_LIMITS:
            return
        
        config = RATE_LIMITS[action]
        max_attempts = config["max_attempts"]
        window_minutes = config["window_minutes"]
        
        client = self._get_client()
        
        # Get current rate limit record
        result = client.table("telegram_rate_limits").select("*").eq(
            "telegram_user_id", telegram_user_id
        ).eq("action_type", action).execute()
        
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=window_minutes)
        
        if result.data and len(result.data) > 0:
            row = result.data[0]
            row_window_start = datetime.fromisoformat(row["window_start"].replace("Z", "+00:00"))
            
            # Check if window has expired
            if row_window_start < window_start:
                # Reset the window
                client.table("telegram_rate_limits").update({
                    "attempt_count": 1,
                    "window_start": now.isoformat()
                }).eq("telegram_user_id", telegram_user_id).eq("action_type", action).execute()
            elif row["attempt_count"] >= max_attempts:
                # Rate limit exceeded
                time_passed = now - row_window_start
                retry_after = window_minutes - int(time_passed.total_seconds() / 60)
                raise RateLimitExceeded(action, max(1, retry_after))
            else:
                # Increment attempt count
                client.table("telegram_rate_limits").update({
                    "attempt_count": row["attempt_count"] + 1
                }).eq("telegram_user_id", telegram_user_id).eq("action_type", action).execute()
        else:
            # Create new rate limit record
            client.table("telegram_rate_limits").insert({
                "telegram_user_id": telegram_user_id,
                "action_type": action,
                "attempt_count": 1,
                "window_start": now.isoformat()
            }).execute()
    
    async def get_user_by_telegram_id(self, telegram_user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by Telegram user ID."""
        client = self._get_client()
        
        result = client.table("telegram_users").select("*").eq(
            "telegram_user_id", telegram_user_id
        ).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    
    async def create_user(
        self,
        telegram_user_id: int,
        display_name: str,
        telegram_username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new user. Returns the created user. Checks rate limit first."""
        # Check rate limit for registration
        await self.check_rate_limit(telegram_user_id, "register")
        
        client = self._get_client()
        
        result = client.table("telegram_users").insert({
            "telegram_user_id": telegram_user_id,
            "display_name": display_name,
            "telegram_username": telegram_username
        }).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        
        raise Exception("Failed to create user")
    
    async def get_active_session(
        self, 
        telegram_user_id: int, 
        telegram_chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get active session for a Telegram user."""
        client = self._get_client()
        
        now = datetime.now(timezone.utc).isoformat()
        
        # Get session with user info using a join-like approach
        # First get the session
        session_result = client.table("telegram_sessions").select("*").eq(
            "telegram_user_id", telegram_user_id
        ).eq("telegram_chat_id", telegram_chat_id).gt("expires_at", now).execute()
        
        if not session_result.data or len(session_result.data) == 0:
            return None
        
        session = session_result.data[0]
        
        # Then get the user info
        user_result = client.table("telegram_users").select(
            "display_name, telegram_username"
        ).eq("id", session["user_id"]).execute()
        
        if user_result.data and len(user_result.data) > 0:
            session["display_name"] = user_result.data[0]["display_name"]
            session["telegram_username"] = user_result.data[0]["telegram_username"]
        
        return session
    
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
        
        client = self._get_client()
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
        
        # Single-session policy: Delete ALL existing sessions for this user
        client.table("telegram_sessions").delete().eq(
            "telegram_user_id", telegram_user_id
        ).execute()
        
        # Create new session with device info
        client.table("telegram_sessions").insert({
            "user_id": user_id,
            "telegram_user_id": telegram_user_id,
            "telegram_chat_id": telegram_chat_id,
            "expires_at": expires_at.isoformat(),
            "device_info": device_info or {}
        }).execute()
    
    async def delete_session(self, telegram_user_id: int, telegram_chat_id: int) -> bool:
        """Delete a session (logout)."""
        client = self._get_client()
        
        result = client.table("telegram_sessions").delete().eq(
            "telegram_user_id", telegram_user_id
        ).eq("telegram_chat_id", telegram_chat_id).execute()
        
        # Check if any rows were deleted
        return result.data is not None and len(result.data) > 0
    
    async def update_last_active(self, telegram_user_id: int, telegram_chat_id: int):
        """Update last active timestamp for a session."""
        client = self._get_client()
        
        now = datetime.now(timezone.utc).isoformat()
        
        client.table("telegram_sessions").update({
            "last_active_at": now
        }).eq("telegram_user_id", telegram_user_id).eq("telegram_chat_id", telegram_chat_id).execute()
