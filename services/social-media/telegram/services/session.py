"""Session management service for Telegram bot authentication.

Uses asyncpg with Supavisor transaction mode (port 6543) for reliable
database connections in Docker containers.

Features:
- Connection pooling with health checks
- Retry logic with exponential backoff
- Rate limiting for registration and login
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, TypeVar, Callable, Awaitable
from urllib.parse import quote_plus

import asyncpg
from asyncpg import Pool, Connection

from config import DATABASE_URL, SESSION_EXPIRY_DAYS

logger = logging.getLogger(__name__)


def _parse_libpq_to_url(dsn: str) -> str:
    """
    Convert libpq connection string format to URL format for asyncpg.
    
    Input:  user=xxx password=xxx host=xxx port=xxx dbname=xxx
    Output: postgresql://user:password@host:port/dbname
    
    Note: Password in libpq format may already be URL-encoded (e.g., %2A for *).
    We decode it first, then re-encode for the URL format.
    """
    from urllib.parse import unquote
    
    if dsn.startswith("postgresql://") or dsn.startswith("postgres://"):
        return dsn  # Already URL format
    
    # Parse key=value pairs
    parts = {}
    for part in dsn.split():
        if '=' in part:
            key, value = part.split('=', 1)
            parts[key] = value
    
    user = parts.get('user', 'postgres')
    password = parts.get('password', '')
    host = parts.get('host', 'localhost')
    port = parts.get('port', '5432')
    dbname = parts.get('dbname', 'postgres')
    
    # Decode password first (in case it's already URL-encoded), then re-encode
    decoded_password = unquote(password)
    encoded_password = quote_plus(decoded_password)
    
    return f"postgresql://{user}:{encoded_password}@{host}:{port}/{dbname}"


# Convert DATABASE_URL to asyncpg-compatible format
_DATABASE_URL_PARSED = _parse_libpq_to_url(DATABASE_URL) if DATABASE_URL else ""

T = TypeVar('T')


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


async def execute_with_retry(
    coro_func: Callable[[], Awaitable[T]],
    max_retries: int = 3,
    base_delay: float = 0.5
) -> T:
    """
    Execute async operation with exponential backoff retry.
    
    Args:
        coro_func: A callable that returns a coroutine
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Base delay in seconds between retries (default: 0.5)
    
    Returns:
        The result of the coroutine
    
    Raises:
        The last exception if all retries fail
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            return await coro_func()
        except (asyncpg.PostgresConnectionError, asyncpg.InterfaceError) as e:
            last_error = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    f"Database connection error (attempt {attempt + 1}/{max_retries}): {e}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
    raise DatabaseConnectionError(f"Database operation failed after {max_retries} retries: {last_error}")


async def _connection_setup(conn: Connection) -> None:
    """Validate connection before returning from pool."""
    try:
        await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=2.0)
    except Exception:
        raise asyncpg.InterfaceError("Connection health check failed")


class SessionService:
    """Manages user registration and sessions for Telegram bot authentication.
    
    Uses asyncpg with Supavisor transaction mode for reliable database connections.
    """
    
    def __init__(self):
        self._pool: Optional[Pool] = None
        self._lock = asyncio.Lock()
    
    async def _get_pool(self) -> Pool:
        """Get or create the connection pool with retry logic."""
        if self._pool is None:
            async with self._lock:
                if self._pool is None:
                    if not _DATABASE_URL_PARSED:
                        raise DatabaseConnectionError("DATABASE_URL_PYTHON environment variable is required")
                    
                    async def create_pool():
                        return await asyncpg.create_pool(
                            _DATABASE_URL_PARSED,
                            min_size=2,
                            max_size=10,
                            command_timeout=30,
                            statement_cache_size=0,  # Required for Supavisor transaction mode
                            setup=_connection_setup,
                        )
                    
                    try:
                        self._pool = await execute_with_retry(create_pool)
                        logger.info("Database connection pool created successfully")
                    except Exception as e:
                        logger.error(f"Failed to create database pool: {e}")
                        raise DatabaseConnectionError(f"Failed to create database pool: {e}")
        
        return self._pool
    
    async def close(self):
        """Close the connection pool gracefully."""
        if self._pool is not None:
            try:
                await asyncio.wait_for(self._pool.close(), timeout=10.0)
                logger.info("Database pool closed gracefully")
            except asyncio.TimeoutError:
                logger.warning("Pool close timed out, terminating connections")
                self._pool.terminate()
            finally:
                self._pool = None
    
    # ==================== Rate Limiting ====================
    
    async def check_rate_limit(self, telegram_user_id: int, action: str) -> None:
        """Check and update rate limit. Raises RateLimitExceeded if exceeded."""
        if action not in RATE_LIMITS:
            return
        
        config = RATE_LIMITS[action]
        max_attempts = config["max_attempts"]
        window_minutes = config["window_minutes"]
        
        pool = await self._get_pool()
        
        async def _check():
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                window_start = now - timedelta(minutes=window_minutes)
                
                # Get current rate limit record
                row = await conn.fetchrow(
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
                        await conn.execute(
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
        
        await execute_with_retry(_check)
    
    async def get_user_by_telegram_id(self, telegram_user_id: int) -> Optional[Dict[str, Any]]:
        """Get user by Telegram user ID."""
        pool = await self._get_pool()
        
        async def _fetch():
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM telegram_users WHERE telegram_user_id = $1",
                    telegram_user_id
                )
                return dict(row) if row else None
        
        return await execute_with_retry(_fetch)
    
    async def create_user(
        self,
        telegram_user_id: int,
        display_name: str,
        telegram_username: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new user. Returns the created user. Checks rate limit first."""
        # Check rate limit for registration
        await self.check_rate_limit(telegram_user_id, "register")
        
        pool = await self._get_pool()
        
        async def _create():
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    INSERT INTO telegram_users (telegram_user_id, display_name, telegram_username)
                    VALUES ($1, $2, $3)
                    RETURNING *
                    """,
                    telegram_user_id, display_name, telegram_username
                )
                if row:
                    return dict(row)
                raise Exception("Failed to create user")
        
        return await execute_with_retry(_create)
    
    async def get_active_session(
        self, 
        telegram_user_id: int, 
        telegram_chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get active session for a Telegram user."""
        pool = await self._get_pool()
        
        async def _fetch():
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                
                # Get session with user info using a JOIN
                row = await conn.fetchrow(
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
                return dict(row) if row else None
        
        return await execute_with_retry(_fetch)
    
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
        
        pool = await self._get_pool()
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
        
        async def _create():
            async with pool.acquire() as conn:
                # Use a transaction for atomicity
                async with conn.transaction():
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
        
        await execute_with_retry(_create)
    
    async def delete_session(self, telegram_user_id: int, telegram_chat_id: int) -> bool:
        """Delete a session (logout)."""
        pool = await self._get_pool()
        
        async def _delete():
            async with pool.acquire() as conn:
                result = await conn.execute(
                    """
                    DELETE FROM telegram_sessions 
                    WHERE telegram_user_id = $1 AND telegram_chat_id = $2
                    """,
                    telegram_user_id, telegram_chat_id
                )
                # Result format: "DELETE n" where n is rows affected
                return result.split()[-1] != "0"
        
        return await execute_with_retry(_delete)
    
    async def update_last_active(self, telegram_user_id: int, telegram_chat_id: int):
        """Update last active timestamp for a session."""
        pool = await self._get_pool()
        
        async def _update():
            async with pool.acquire() as conn:
                now = datetime.now(timezone.utc)
                await conn.execute(
                    """
                    UPDATE telegram_sessions 
                    SET last_active_at = $1
                    WHERE telegram_user_id = $2 AND telegram_chat_id = $3
                    """,
                    now, telegram_user_id, telegram_chat_id
                )
        
        await execute_with_retry(_update)
