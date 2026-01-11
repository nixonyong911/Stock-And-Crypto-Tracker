"""Configuration and database connection for MCP Analysis Server."""

import asyncio
import os
import signal
from contextlib import asynccontextmanager
from typing import Optional, Callable, Any

import asyncpg

# Configuration from environment
DATABASE_URL = os.environ.get("DATABASE_URL_PYTHON", "")
MCP_PORT = int(os.environ.get("MCP_PORT", "8085"))
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))

# Query timeout in seconds
QUERY_TIMEOUT = 10.0

# Global connection pool
_pool: Optional[asyncpg.Pool] = None

# Shutdown flag for graceful termination
_shutdown_event: Optional[asyncio.Event] = None


async def _connection_init(conn: asyncpg.Connection) -> None:
    """
    Initialize each connection with health check settings.
    Called when a new connection is created in the pool.
    """
    # Set statement timeout at connection level (backup for query-level timeout)
    await conn.execute("SET statement_timeout = '15s'")


async def _connection_setup(conn: asyncpg.Connection) -> None:
    """
    Validate connection before returning from pool.
    Called each time a connection is acquired from the pool.
    Detects stale/dead connections early.
    """
    try:
        # Quick health check - if this fails, connection is bad
        await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=2.0)
    except Exception:
        # Connection is bad, raise to trigger pool to create new one
        raise asyncpg.InterfaceError("Connection health check failed")


async def init_pool() -> asyncpg.Pool:
    """
    Initialize the database connection pool eagerly on startup.
    
    Pool configuration for stability:
    - min_size=2: Keep 2 warm connections ready
    - max_size=10: Scale up to 10 under load
    - max_inactive_connection_lifetime=300: Close idle connections after 5 min
    - command_timeout=30: Default query timeout
    - setup: Health check on each acquire (detect dead connections)
    - init: Set statement timeout on new connections
    """
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise ValueError("DATABASE_URL_PYTHON environment variable is required")
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            max_inactive_connection_lifetime=300,  # Close idle connections after 5 min
            command_timeout=30,
            statement_cache_size=0,  # Required for Supavisor transaction mode (port 6543)
            setup=_connection_setup,  # Health check on acquire
            init=_connection_init,    # Initialize new connections
        )
        print(f"Database pool initialized: min=2, max=10, idle_timeout=300s")
    return _pool


async def get_pool() -> asyncpg.Pool:
    """Get the database connection pool (must be initialized first)."""
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_pool() first.")
    return _pool


async def close_pool(timeout: float = 10.0):
    """
    Close the database connection pool gracefully.
    
    Args:
        timeout: Maximum time to wait for connections to be released
    """
    global _pool
    if _pool:
        try:
            # Wait for active connections to be released
            await asyncio.wait_for(_pool.close(), timeout=timeout)
            print("Database pool closed gracefully")
        except asyncio.TimeoutError:
            print(f"Warning: Pool close timed out after {timeout}s, terminating connections")
            _pool.terminate()
        finally:
            _pool = None


def get_shutdown_event() -> asyncio.Event:
    """Get or create the shutdown event for graceful termination."""
    global _shutdown_event
    if _shutdown_event is None:
        _shutdown_event = asyncio.Event()
    return _shutdown_event


def setup_signal_handlers():
    """
    Setup signal handlers for graceful shutdown.
    Handles SIGTERM (docker stop) and SIGINT (Ctrl+C).
    """
    def signal_handler(sig, frame):
        print(f"Received signal {sig}, initiating graceful shutdown...")
        event = get_shutdown_event()
        # Schedule the event set in the event loop
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(event.set)
        except RuntimeError:
            # No running loop, just set it
            event.set()
    
    # Register handlers (works on Unix; on Windows only SIGINT works)
    signal.signal(signal.SIGINT, signal_handler)
    try:
        signal.signal(signal.SIGTERM, signal_handler)
    except (AttributeError, ValueError):
        # SIGTERM not available on Windows
        pass


@asynccontextmanager
async def get_db():
    """
    Dependency for database connection - verified FastMCP Depends pattern.
    
    Use with FastMCP's Depends() to inject database connections into tools.
    The connection is automatically released back to the pool after use,
    even if an exception or timeout occurs.
    """
    pool = await get_pool()
    conn = await pool.acquire()
    try:
        yield conn
    finally:
        # Always release connection back to pool
        await pool.release(conn)


async def safe_query(conn: asyncpg.Connection, query: str, *args, timeout: float = QUERY_TIMEOUT) -> list:
    """
    Execute a query with proper timeout handling that ensures connection integrity.
    
    Unlike asyncio.wait_for() which can leave connections in undefined state,
    this uses PostgreSQL's statement_timeout for clean cancellation.
    
    Args:
        conn: Database connection
        query: SQL query string
        *args: Query parameters
        timeout: Query timeout in seconds
    
    Returns:
        List of result rows
    
    Raises:
        asyncio.TimeoutError: If query exceeds timeout
        asyncpg.PostgresError: For database errors
    """
    # Set per-query timeout (overrides connection default)
    timeout_ms = int(timeout * 1000)
    try:
        # Set statement timeout for this transaction
        await conn.execute(f"SET LOCAL statement_timeout = '{timeout_ms}'")
        return await conn.fetch(query, *args)
    except asyncpg.QueryCanceledError as e:
        # PostgreSQL cancelled the query due to statement_timeout
        raise asyncio.TimeoutError(f"Query timed out after {timeout}s") from e


async def safe_query_one(conn: asyncpg.Connection, query: str, *args, timeout: float = QUERY_TIMEOUT):
    """
    Execute a query expecting a single row with proper timeout handling.
    
    Args:
        conn: Database connection
        query: SQL query string
        *args: Query parameters
        timeout: Query timeout in seconds
    
    Returns:
        Single result row or None
    """
    timeout_ms = int(timeout * 1000)
    try:
        await conn.execute(f"SET LOCAL statement_timeout = '{timeout_ms}'")
        return await conn.fetchrow(query, *args)
    except asyncpg.QueryCanceledError as e:
        raise asyncio.TimeoutError(f"Query timed out after {timeout}s") from e


async def execute_with_retry(coro, max_retries: int = 3, base_delay: float = 0.5):
    """
    Execute async operation with exponential backoff retry.
    
    Args:
        coro: The coroutine to execute
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
            return await coro
        except (asyncpg.PostgresConnectionError, asyncpg.InterfaceError) as e:
            last_error = e
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"Database connection error (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"Retrying in {delay}s...")
                await asyncio.sleep(delay)
    raise last_error
