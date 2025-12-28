"""
Async PostgreSQL connection pool using asyncpg.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Optional, AsyncGenerator
import asyncpg
from asyncpg import Pool, Connection
import structlog

from config import get_config

logger = structlog.get_logger(__name__)


class DatabaseConnection:
    """Manages async PostgreSQL connection pool."""
    
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


# Initialize tables if they don't exist (called on startup)
async def ensure_tables_exist() -> None:
    """
    Ensure the AI Hub tables exist.
    Note: In production, use EF Core migrations. This is a fallback.
    """
    create_logs_table = """
    CREATE TABLE IF NOT EXISTS ai_hub_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL,
        model_id VARCHAR(150) NOT NULL,
        caller_service VARCHAR(100),
        google_project_id VARCHAR(100),
        message_preview TEXT,
        response_preview TEXT,
        tokens_input INT,
        tokens_output INT,
        duration_ms INT,
        retry_count INT DEFAULT 0,
        rate_limit_type VARCHAR(10),
        status VARCHAR(20) NOT NULL,
        http_status_code INT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT ai_hub_logs_status_check CHECK (status IN (
            'success', 'rate_limited', 'server_error', 
            'unavailable', 'client_error', 'timeout'
        ))
    );
    """
    
    create_logs_indexes = """
    CREATE INDEX IF NOT EXISTS idx_ai_hub_logs_created ON ai_hub_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_hub_logs_model ON ai_hub_logs(model_id);
    CREATE INDEX IF NOT EXISTS idx_ai_hub_logs_status ON ai_hub_logs(status);
    CREATE INDEX IF NOT EXISTS idx_ai_hub_logs_project ON ai_hub_logs(google_project_id);
    """
    
    create_rate_tracking_table = """
    CREATE TABLE IF NOT EXISTS ai_hub_rate_tracking (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        google_project_id VARCHAR(100) NOT NULL,
        model_family VARCHAR(50) NOT NULL,
        minute_window TIMESTAMPTZ NOT NULL,
        requests_count INT DEFAULT 0,
        tokens_count INT DEFAULT 0,
        pacific_date DATE NOT NULL,
        daily_requests INT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(google_project_id, model_family, minute_window)
    );
    """
    
    create_rate_tracking_index = """
    CREATE INDEX IF NOT EXISTS idx_rate_tracking_lookup 
        ON ai_hub_rate_tracking(google_project_id, model_family, minute_window DESC);
    """
    
    try:
        await DatabaseConnection.execute(create_logs_table)
        await DatabaseConnection.execute(create_logs_indexes)
        await DatabaseConnection.execute(create_rate_tracking_table)
        await DatabaseConnection.execute(create_rate_tracking_index)
        logger.info("AI Hub database tables ensured")
    except Exception as e:
        logger.warning("Could not ensure tables (may already exist via EF Core)", error=str(e))





