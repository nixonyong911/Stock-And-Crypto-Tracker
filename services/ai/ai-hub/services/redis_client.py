"""
Redis Client for AI Hub

Provides async Redis connection pool for request logging queue.
"""

import os
from typing import Optional

import redis.asyncio as redis
import structlog

logger = structlog.get_logger(__name__)


class RedisClient:
    """Manages async Redis connection pool."""
    
    _client: Optional[redis.Redis] = None
    
    @classmethod
    async def get_client(cls) -> redis.Redis:
        """Get or create the Redis client."""
        if cls._client is None:
            redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
            cls._client = redis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            logger.info("Redis client created", url=redis_url.split("@")[-1])  # Log without credentials
        return cls._client
    
    @classmethod
    async def close(cls) -> None:
        """Close the Redis client."""
        if cls._client is not None:
            await cls._client.close()
            cls._client = None
            logger.info("Redis client closed")
    
    @classmethod
    async def health_check(cls) -> bool:
        """Check if Redis connection is healthy."""
        try:
            client = await cls.get_client()
            await client.ping()
            return True
        except Exception as e:
            logger.error("Redis health check failed", error=str(e))
            return False
