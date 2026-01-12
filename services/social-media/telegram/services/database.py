"""Database infrastructure layer for Telegram bot.

Single source of truth for all database connections in the Telegram service.
Uses per-request connections optimized for Supavisor transaction mode (port 6543).

Supavisor handles connection pooling on the server side, so we use stateless
per-request connections for:
- No stale connections
- No resource leaks
- Simpler cleanup
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, Optional, Dict, TypeVar, Callable, Awaitable
from urllib.parse import quote_plus, unquote

import asyncpg

logger = logging.getLogger(__name__)

T = TypeVar('T')


class DatabaseConnectionError(Exception):
    """Raised when database connection fails."""
    pass


async def _execute_with_retry(
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
        DatabaseConnectionError: If all retries fail
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            return await coro_func()
        except (asyncpg.PostgresConnectionError, asyncpg.InterfaceError, OSError) as e:
            last_error = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    f"Database connection error (attempt {attempt + 1}/{max_retries}): {e}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
    raise DatabaseConnectionError(f"Database operation failed after {max_retries} retries: {last_error}")


class DatabaseContext:
    """
    Infrastructure layer for database operations.
    Single source of truth for all DB connections in Telegram service.
    
    Uses per-request connections optimized for Supavisor transaction mode.
    Each operation creates a fresh connection and closes it after completion.
    """
    
    def __init__(self, dsn: str):
        """
        Initialize DatabaseContext with a connection string.
        
        Args:
            dsn: Database connection string in libpq format
                 (user=xxx password=xxx host=xxx port=xxx dbname=xxx)
                 or PostgreSQL URL format (postgresql://...)
        """
        if not dsn:
            raise DatabaseConnectionError("Database connection string is required")
        self._dsn = self._parse_libpq_to_url(dsn)
        logger.info("DatabaseContext initialized")
    
    @staticmethod
    def _parse_libpq_to_url(dsn: str) -> str:
        """
        Convert libpq connection string format to URL format for asyncpg.
        
        Input:  user=xxx password=xxx host=xxx port=xxx dbname=xxx
        Output: postgresql://user:password@host:port/dbname
        
        Note: Password in libpq format may already be URL-encoded (e.g., %2A for *).
        We decode it first, then re-encode for the URL format.
        """
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
    
    async def _connect(self) -> asyncpg.Connection:
        """
        Create a new database connection.
        
        Returns:
            asyncpg.Connection: A new database connection
            
        Note: Caller is responsible for closing the connection.
        """
        return await asyncpg.connect(
            self._dsn,
            statement_cache_size=0,  # Required for Supavisor transaction mode
            command_timeout=30
        )
    
    async def fetch_one(self, query: str, *args) -> Optional[Dict[str, Any]]:
        """
        Execute a query and return a single row as a dictionary.
        
        Args:
            query: SQL query with $1, $2, ... placeholders
            *args: Query parameters
            
        Returns:
            Dictionary of column:value or None if no row found
        """
        async def _fetch():
            conn = await self._connect()
            try:
                row = await conn.fetchrow(query, *args)
                return dict(row) if row else None
            finally:
                await conn.close()
        
        return await _execute_with_retry(_fetch)
    
    async def fetch_val(self, query: str, *args) -> Any:
        """
        Execute a query and return a single value.
        
        Args:
            query: SQL query with $1, $2, ... placeholders
            *args: Query parameters
            
        Returns:
            The first column of the first row, or None
        """
        async def _fetch():
            conn = await self._connect()
            try:
                return await conn.fetchval(query, *args)
            finally:
                await conn.close()
        
        return await _execute_with_retry(_fetch)
    
    async def execute(self, query: str, *args) -> str:
        """
        Execute a query without returning results (INSERT/UPDATE/DELETE).
        
        Args:
            query: SQL query with $1, $2, ... placeholders
            *args: Query parameters
            
        Returns:
            Status string (e.g., "INSERT 0 1", "UPDATE 1", "DELETE 1")
        """
        async def _execute():
            conn = await self._connect()
            try:
                return await conn.execute(query, *args)
            finally:
                await conn.close()
        
        return await _execute_with_retry(_execute)
    
    @asynccontextmanager
    async def transaction(self):
        """
        Context manager for atomic multi-statement operations.
        
        Usage:
            async with db.transaction() as conn:
                await conn.execute("DELETE FROM ...")
                await conn.execute("INSERT INTO ...")
        
        Yields:
            asyncpg.Connection: Connection with active transaction
        """
        async def _connect():
            return await self._connect()
        
        conn = await _execute_with_retry(_connect)
        try:
            async with conn.transaction():
                yield conn
        finally:
            await conn.close()
