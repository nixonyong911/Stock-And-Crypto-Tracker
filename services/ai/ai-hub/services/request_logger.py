"""
Request Logger for AI Hub

Handles request/response logging via Redis queue for non-blocking operation.
- push_log_event(): Push log data to Redis queue
- consume_log_events(): Background consumer that writes to Supabase
"""

import asyncio
import json
from typing import Any, Dict, Optional, Tuple

from fastapi import Request
from fastapi.responses import Response
from starlette.responses import StreamingResponse

import structlog

from db.connection import DatabaseConnection
from services.redis_client import RedisClient

logger = structlog.get_logger(__name__)

# Constants
REDIS_QUEUE_NAME = "ai_hub_request_logs"
MAX_BODY_SIZE = 10 * 1024  # 10KB max for request/response body storage


def truncate_body(body: Any, max_size: int = MAX_BODY_SIZE) -> Any:
    """
    Truncate body if it exceeds max size.
    Returns the body as-is if it's small enough, or a truncated version with indicator.
    """
    if body is None:
        return None
    
    try:
        if isinstance(body, dict):
            body_str = json.dumps(body)
        elif isinstance(body, str):
            body_str = body
        else:
            body_str = str(body)
        
        if len(body_str) <= max_size:
            return body if isinstance(body, dict) else body_str
        
        # Truncate and add indicator
        truncated = body_str[:max_size]
        return {"_truncated": True, "_original_size": len(body_str), "content": truncated}
    except Exception:
        return {"_error": "Could not serialize body"}


async def read_request_body(request: Request) -> Optional[Dict[str, Any]]:
    """
    Read and cache the request body.
    FastAPI request body can only be read once, so we cache it.
    """
    try:
        body_bytes = await request.body()
        if not body_bytes:
            return None
        
        body_str = body_bytes.decode("utf-8")
        try:
            return json.loads(body_str)
        except json.JSONDecodeError:
            return {"_raw": body_str}
    except Exception as e:
        logger.warning("Failed to read request body", error=str(e))
        return None


async def read_response_body(response: Response) -> Tuple[Optional[Dict[str, Any]], Response]:
    """
    Read the response body and return a new response.
    Response body is a stream, so we need to consume it and create a new response.
    
    Returns:
        Tuple of (body_dict, new_response)
    """
    try:
        # For StreamingResponse, we need to consume the body
        if isinstance(response, StreamingResponse):
            body_parts = []
            async for chunk in response.body_iterator:
                if isinstance(chunk, bytes):
                    body_parts.append(chunk)
                else:
                    body_parts.append(chunk.encode())
            
            body_bytes = b"".join(body_parts)
            
            # Create new response with the same body
            new_response = Response(
                content=body_bytes,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        else:
            # For regular Response, body is already available
            body_bytes = response.body
            new_response = response
        
        if not body_bytes:
            return None, new_response
        
        body_str = body_bytes.decode("utf-8")
        try:
            body_dict = json.loads(body_str)
            return truncate_body(body_dict), new_response
        except json.JSONDecodeError:
            return truncate_body(body_str), new_response
            
    except Exception as e:
        logger.warning("Failed to read response body", error=str(e))
        return None, response


async def push_log_event(data: Dict[str, Any]) -> bool:
    """
    Push log event to Redis queue.
    Non-blocking - returns immediately after pushing.
    """
    try:
        client = await RedisClient.get_client()
        # Serialize data to JSON and push to list
        await client.lpush(REDIS_QUEUE_NAME, json.dumps(data))
        return True
    except Exception as e:
        logger.error("Failed to push log event to Redis", error=str(e))
        return False


async def consume_log_events() -> None:
    """
    Background task that consumes log events from Redis and writes to Supabase.
    Uses BRPOP for blocking pop with timeout.
    """
    logger.info("Starting request log consumer")
    
    while True:
        try:
            client = await RedisClient.get_client()
            
            # BRPOP with 5 second timeout (returns None if no item)
            result = await client.brpop(REDIS_QUEUE_NAME, timeout=5)
            
            if result is None:
                continue
            
            # result is (queue_name, data)
            _, data_str = result
            data = json.loads(data_str)
            
            # Insert into Supabase
            await insert_log_to_db(data)
            
        except asyncio.CancelledError:
            logger.info("Request log consumer cancelled")
            break
        except Exception as e:
            logger.error("Error in log consumer", error=str(e))
            # Wait a bit before retrying to avoid tight loop on persistent errors
            await asyncio.sleep(1)


async def insert_log_to_db(data: Dict[str, Any]) -> bool:
    """
    Insert log record into Supabase logging_ai_hub_request table.
    """
    try:
        query = """
            INSERT INTO logging_ai_hub_request 
            (request_timestamp, endpoint, request_body, response_body, elapsed_time_sec, status_code)
            VALUES ($1, $2, $3, $4, $5, $6)
        """
        
        # Convert request/response body to JSON strings for JSONB columns
        request_body_json = json.dumps(data.get("request_body")) if data.get("request_body") else None
        response_body_json = json.dumps(data.get("response_body")) if data.get("response_body") else None
        
        await DatabaseConnection.execute(
            query,
            data["request_timestamp"],
            data["endpoint"],
            request_body_json,
            response_body_json,
            data["elapsed_time_sec"],
            data["status_code"]
        )
        
        logger.debug(
            "Log record inserted",
            endpoint=data["endpoint"],
            elapsed_sec=data["elapsed_time_sec"]
        )
        return True
        
    except Exception as e:
        logger.error("Failed to insert log record", error=str(e), endpoint=data.get("endpoint"))
        return False
