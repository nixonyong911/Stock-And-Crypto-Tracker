"""Configuration and database connection for MCP Analysis Server."""

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg

# Configuration from environment
DATABASE_URL = os.environ.get("DATABASE_URL_PYTHON", "")
MCP_PORT = int(os.environ.get("MCP_PORT", "8085"))
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_pool() -> asyncpg.Pool:
    """Initialize the database connection pool eagerly on startup."""
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise ValueError("DATABASE_URL_PYTHON environment variable is required")
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def get_pool() -> asyncpg.Pool:
    """Get the database connection pool (must be initialized first)."""
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_pool() first.")
    return _pool


async def close_pool():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_db():
    """
    Dependency for database connection - verified FastMCP Depends pattern.
    
    Use with FastMCP's Depends() to inject database connections into tools.
    The connection is automatically released back to the pool after use.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


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
