"""
Async PostgreSQL connection pool using asyncpg.

Features:
- Connection pooling with health checks
- Retry logic with exponential backoff for transient failures
- Supavisor transaction mode support (statement_cache_size=0)
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator, TypeVar, Callable, Awaitable
import asyncpg
from asyncpg import Pool, Connection
import structlog

from config import get_config

logger = structlog.get_logger(__name__)

T = TypeVar('T')


async def execute_with_retry(
    coro_func: Callable[[], Awaitable[T]],
    max_retries: int = 3,
    base_delay: float = 0.5
) -> T:
    """
    Execute async operation with exponential backoff retry.
    
    Args:
        coro_func: A callable that returns a coroutine (not the coroutine itself)
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
                    "Database connection error, retrying",
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    delay=delay,
                    error=str(e)
                )
                await asyncio.sleep(delay)
    raise last_error


async def _connection_setup(conn: Connection) -> None:
    """
    Validate connection before returning from pool.
    Called each time a connection is acquired from the pool.
    Detects stale/dead connections early.
    """
    try:
        await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=2.0)
    except Exception:
        raise asyncpg.InterfaceError("Connection health check failed")


class DatabaseConnection:
    """Manages async PostgreSQL connection pool with retry logic."""
    
    _pool: Optional[Pool] = None
    _lock: asyncio.Lock = asyncio.Lock()
    
    @classmethod
    async def get_pool(cls) -> Pool:
        """Get or create the connection pool."""
        if cls._pool is None:
            async with cls._lock:
                if cls._pool is None:
                    config = get_config()
                    cls._pool = await asyncpg.create_pool(
                        config.settings.db_url,
                        min_size=2,
                        max_size=10,
                        command_timeout=30,
                        statement_cache_size=0,  # Required for Supavisor transaction mode (port 6543)
                        setup=_connection_setup,  # Health check on acquire
                    )
                    logger.info("Database connection pool created")
        return cls._pool
    
    @classmethod
    async def close(cls) -> None:
        """Close the connection pool."""
        if cls._pool is not None:
            await cls._pool.close()
            cls._pool = None
            logger.info("Database connection pool closed")
    
    @classmethod
    @asynccontextmanager
    async def acquire(cls) -> AsyncGenerator[Connection, None]:
        """Acquire a connection from the pool."""
        pool = await cls.get_pool()
        async with pool.acquire() as connection:
            yield connection
    
    @classmethod
    async def execute(cls, query: str, *args) -> str:
        """Execute a query and return status."""
        async with cls.acquire() as conn:
            return await conn.execute(query, *args)
    
    @classmethod
    async def fetch(cls, query: str, *args) -> list:
        """Fetch all rows from a query."""
        async with cls.acquire() as conn:
            return await conn.fetch(query, *args)
    
    @classmethod
    async def fetchrow(cls, query: str, *args) -> Optional[asyncpg.Record]:
        """Fetch a single row from a query."""
        async with cls.acquire() as conn:
            return await conn.fetchrow(query, *args)
    
    @classmethod
    async def fetchval(cls, query: str, *args):
        """Fetch a single value from a query."""
        async with cls.acquire() as conn:
            return await conn.fetchval(query, *args)
    
    @classmethod
    async def health_check(cls) -> bool:
        """Check if database connection is healthy."""
        try:
            result = await cls.fetchval("SELECT 1")
            return result == 1
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            return False


async def get_db_connection() -> DatabaseConnection:
    """Dependency injection helper for FastAPI."""
    return DatabaseConnection


# Placeholder for future table initialization if needed
async def ensure_tables_exist() -> None:
    """No tables needed - logging and rate limiting removed."""
    pass





