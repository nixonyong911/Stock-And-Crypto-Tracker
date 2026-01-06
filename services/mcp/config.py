"""Configuration and database connection for MCP Analysis Server."""

import os
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg

# Configuration from environment
DATABASE_URL = os.environ.get("DATABASE_URL", "")
MCP_PORT = int(os.environ.get("MCP_PORT", "8085"))

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise ValueError("DATABASE_URL environment variable is required")
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=2,
            max_size=10,
            command_timeout=30,
        )
    return _pool


async def close_pool():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection():
    """Context manager for database connections."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn
