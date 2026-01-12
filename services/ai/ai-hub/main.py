"""
AI Hub Service - Main FastAPI Application

A multi-model AI gateway that provides:
- Google Gemini API access (with future support for other providers)
- Automatic retry with exponential backoff
"""

import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Union
from uuid import uuid4

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_config
from db.connection import DatabaseConnection, ensure_tables_exist
from models.registry import get_registry
from schemas import (
    ChatRequest,
    ChatSuccessResponse,
    ChatErrorResponse,
    HealthResponse,
    ModelsListResponse,
    ModelInfo,
    TokenUsage,
    ErrorCodes,
    CLIMessageRequest,
)
from services.retry_handler import RetryHandler, RetryResult
from services.cli_executor import get_cli_executor, kill_orphaned_cursor_agents
from services.telegram_versions import telegram_agent_v1, telegram_agent_v2
from services.redis_client import RedisClient
from services.request_logger import (
    push_log_event,
    consume_log_events,
    read_request_body,
    read_response_body,
)

# Configure stdlib logging level (required for structlog.stdlib.filter_by_level)
import logging
logging.basicConfig(level=logging.INFO, format="%(message)s")

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)

# Global instances
retry_handler = RetryHandler()


async def orphan_cleanup_task():
    """
    Background task to kill orphaned cursor-agent processes.
    
    Runs every 60 seconds to detect and kill cursor-agent processes
    that have been running for more than 5 minutes (likely stuck).
    This prevents zombie processes from blocking new requests.
    """
    # Wait 30 seconds before first run to let startup complete
    await asyncio.sleep(30)
    
    while True:
        try:
            # Kill cursor-agent processes older than 5 minutes
            killed = await kill_orphaned_cursor_agents(max_age_seconds=300)
            if killed > 0:
                logger.info("orphan_cleanup_completed", killed_count=killed)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Orphan cleanup task error", error=str(e))
        
        # Run every 60 seconds
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting AI Hub Service")
    
    # Initialize database connection pool (optional - CLI endpoints don't need DB)
    try:
        await DatabaseConnection.get_pool()
        # Ensure tables exist (fallback if EF Core migration not run)
        try:
            await ensure_tables_exist()
        except Exception as e:
            logger.warning("Could not ensure tables", error=str(e))
    except Exception as e:
        logger.warning("Database connection failed (CLI endpoints will still work)", error=str(e))
    
    # Start background tasks
    orphan_cleanup = asyncio.create_task(orphan_cleanup_task())
    log_consumer = asyncio.create_task(consume_log_events())
    
    # Initialize model registry
    registry = get_registry()
    models = registry.list_models()
    logger.info("AI Hub ready", models_registered=len(models))
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Hub Service")
    orphan_cleanup.cancel()
    log_consumer.cancel()
    await RedisClient.close()
    await DatabaseConnection.close()


app = FastAPI(
    title="AI Hub Service",
    description="Multi-model AI gateway for internal microservices",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware (for development/frontend access)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===========================================
# API Key Authentication Middleware
# ===========================================
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    """
    Validate X-API-Key header for all non-health endpoints.
    
    - Health endpoints (/health*) are excluded for k8s probes
    - Returns 401 if API key is missing or invalid
    - If AI_HUB_API_KEY is not configured, authentication is disabled (dev mode)
    """
    # Skip auth for health endpoints
    if request.url.path.startswith("/health"):
        return await call_next(request)
    
    # Skip auth for OpenAPI docs
    if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
        return await call_next(request)
    
    config = get_config()
    expected_key = config.settings.ai_hub_api_key
    
    # If no API key configured, skip auth (dev mode)
    if not expected_key:
        logger.warning("API key authentication disabled (AI_HUB_API_KEY not set)")
        return await call_next(request)
    
    # Validate API key
    api_key = request.headers.get("X-API-Key")
    
    if not api_key:
        logger.warning("Request missing API key", path=request.url.path)
        return JSONResponse(
            status_code=401,
            content={"error": "Missing X-API-Key header"}
        )
    
    if api_key != expected_key:
        logger.warning("Invalid API key", path=request.url.path)
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid API key"}
        )
    
    return await call_next(request)


# ===========================================
# Request/Response Logging Middleware
# ===========================================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all requests and responses to Supabase via Redis queue.
    
    - Captures: timestamp, endpoint, request body, response body, elapsed time, status code
    - Uses Redis queue for non-blocking operation
    - Skips health and documentation endpoints
    """
    # Skip logging for health/docs endpoints
    if request.url.path.startswith(("/health", "/docs", "/redoc", "/openapi.json")):
        return await call_next(request)
    
    start_time = time.perf_counter()
    request_timestamp = datetime.utcnow()
    endpoint = request.url.path
    
    # Read request body (cached for re-reading by endpoint)
    request_body = await read_request_body(request)
    
    # Call the actual endpoint
    response = await call_next(request)
    
    # Calculate elapsed time with 1 decimal precision
    elapsed_sec = round(time.perf_counter() - start_time, 1)
    
    # Read response body (returns new response to avoid stream consumption issues)
    response_body, new_response = await read_response_body(response)
    
    # Push to Redis queue (fire-and-forget, non-blocking)
    asyncio.create_task(push_log_event({
        "request_timestamp": request_timestamp.isoformat(),
        "endpoint": endpoint,
        "request_body": request_body,
        "response_body": response_body,
        "elapsed_time_sec": elapsed_sec,
        "status_code": new_response.status_code
    }))
    
    return new_response


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    config = get_config()
    registry = get_registry()
    db_healthy = await DatabaseConnection.health_check()
    
    return HealthResponse(
        status="healthy" if db_healthy else "unhealthy",
        service="ai-hub",
        version="1.0.0",
        models_registered=len(registry.list_models()),
        database_connected=db_healthy,
        timestamp=datetime.utcnow(),
    )


@app.get("/health/live")
async def liveness():
    """Kubernetes liveness probe."""
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness():
    """Kubernetes readiness probe."""
    db_healthy = await DatabaseConnection.health_check()
    if not db_healthy:
        raise HTTPException(status_code=503, detail="Database not ready")
    return {"status": "ready"}


@app.get("/api/models", response_model=ModelsListResponse)
async def list_models():
    """List all registered AI models."""
    registry = get_registry()
    models = []
    
    for model_id in registry.list_models():
        info = registry.get_model_info(model_id)
        if info:
            models.append(ModelInfo(**info))
    
    return ModelsListResponse(models=models, total=len(models))


@app.post(
    "/api/chat",
    response_model=Union[ChatSuccessResponse, ChatErrorResponse],
    responses={
        200: {"model": ChatSuccessResponse},
        400: {"model": ChatErrorResponse},
        429: {"model": ChatErrorResponse},
        500: {"model": ChatErrorResponse},
    }
)
async def chat(request: ChatRequest):
    """
    Send a message to an AI model and get a response.
    
    This endpoint handles:
    - Model routing based on model_id
    - Automatic retry on transient errors
    """
    request_id = uuid4()
    start_time = time.time()
    config = get_config()
    
    logger.info(
        "Chat request received",
        request_id=str(request_id),
        model_id=request.model_id,
        caller_service=request.caller_service,
        message_length=len(request.message)
    )
    
    # Get model client
    registry = get_registry()
    client = registry.get_client(request.model_id)
    
    if client is None:
        # Check if model exists but has no API key
        model_info = registry.get_model_info(request.model_id)
        if model_info and not model_info.get("has_api_key"):
            error_response = ChatErrorResponse(
                request_id=request_id,
                error=f"API key not configured for model: {request.model_id}",
                error_code=ErrorCodes.API_KEY_MISSING,
                model_id=request.model_id,
            )
        else:
            error_response = ChatErrorResponse(
                request_id=request_id,
                error=f"Model not found: {request.model_id}",
                error_code=ErrorCodes.MODEL_NOT_FOUND,
                model_id=request.model_id,
            )
        
        raise HTTPException(status_code=400, detail=error_response.model_dump())
    
    # Get model config
    model_config = config.get_model(request.model_id)
    model_family = model_config.model_name if model_config else "unknown"
    
    # Execute with retry
    async def make_request():
        return await client.generate(
            message=request.message,
            system_prompt=request.system_prompt
        )
    
    result: RetryResult = await retry_handler.execute_with_retry(
        make_request,
        operation_name=f"gemini_{model_family}"
    )
    
    duration_ms = int((time.time() - start_time) * 1000)
    
    if result.success:
        model_response = result.result
        total_tokens = model_response.tokens_input + model_response.tokens_output
        
        logger.info(
            "Chat request successful",
            request_id=str(request_id),
            duration_ms=duration_ms,
            tokens_total=total_tokens,
            retry_count=result.retry_count
        )
        
        return ChatSuccessResponse(
            request_id=request_id,
            response=model_response.text,
            model_id=request.model_id,
            tokens_used=TokenUsage(
                input=model_response.tokens_input,
                output=model_response.tokens_output,
                total=total_tokens,
            ),
            duration_ms=duration_ms,
        )
    
    else:
        # Request failed after retries
        error_msg = str(result.error) if result.error else "Unknown error"
        
        # Determine error type
        if result.http_status == 429:
            error_code = ErrorCodes.RATE_LIMIT_EXHAUSTED
            status = "rate_limited"
        elif result.http_status in (500, 503):
            error_code = ErrorCodes.PROVIDER_ERROR
            status = "server_error" if result.http_status == 500 else "unavailable"
        elif result.http_status == 408:
            error_code = ErrorCodes.TIMEOUT
            status = "timeout"
        else:
            error_code = ErrorCodes.INTERNAL_ERROR
            status = "server_error"
        
        error_response = ChatErrorResponse(
            request_id=request_id,
            error=f"{error_msg} (after {result.retry_count} retries)",
            error_code=error_code,
            model_id=request.model_id,
            rate_limit_type="RPM" if result.http_status == 429 else None,
            retry_after_seconds=result.retry_after,
        )
        
        logger.error(
            "Chat request failed",
            request_id=str(request_id),
            error=error_msg,
            http_status=result.http_status,
            retry_count=result.retry_count,
            duration_ms=duration_ms
        )
        
        status_code = result.http_status or 500
        raise HTTPException(status_code=status_code, detail=error_response.model_dump())


# ===========================================
# CLI Endpoints - Pre-configured agents
# ===========================================
# Format: /<type>/<instruction-folder>/<agent>/<mode>
# - type: cli or api
# - instruction-folder: maps to context path (from AI_HUB_DEFAULT_CONTEXT_PATH)
# - agent: claude, cursor, etc.
# - mode: opus-4.5, sonnet-4, default, etc.

def get_cli_endpoints():
    """Get CLI endpoints with context path from config."""
    config = get_config()
    context_path = config.settings.ai_hub_default_context_path
    return [
        {
            "path": "/cli/stock-tracker/claude/opus-4.5",
            "instruction_folder": "stock-tracker",
            "context_path": context_path,
            "agent": "claude",
            "mode": "opus-4.5",
            "description": "Stock Tracker analysis with Claude Opus 4.5"
        },
        {
            "path": "/cli/stock-tracker/cursor/opus-4.5",
            "instruction_folder": "stock-tracker",
            "context_path": context_path,
            "agent": "cursor",
            "mode": "opus-4.5",
            "description": "Stock Tracker analysis with Cursor Opus 4.5"
        },
        {
            "path": "/cli/telegram-agent/cursor/sonnet-4.5",
            "instruction_folder": "stock-tracker",
            "context_path": context_path,
            "agent": "cursor",
            "mode": "sonnet-4.5",
            "description": "Telegram AI Chat Agent - Stock analysis with MCP tools"
        },
        {
            "path": "/cli/telegram-agent-test/cursor/sonnet-4.5",
            "instruction_folder": "stock-tracker",
            "context_path": context_path,
            "agent": "cursor",
            "mode": "sonnet-4.5",
            "description": "Telegram AI Chat Agent TEST - For testing without affecting production"
        }
    ]


@app.get("/cli")
async def list_cli_endpoints():
    """Discovery endpoint - list all available CLI endpoints."""
    endpoints = get_cli_endpoints()
    return {
        "format": "/<type>/<instruction-folder>/<agent>/<mode>",
        "endpoints": endpoints,
        "total": len(endpoints)
    }


@app.post("/cli/stock-tracker/claude/opus-4.5")
async def cli_stock_tracker_claude_opus45(request: CLIMessageRequest):
    """Stock Tracker + Claude Opus 4.5."""
    config = get_config()
    executor = get_cli_executor()
    try:
        result = await executor.execute(
            cli="claude",
            message=request.message,
            context_path=config.settings.ai_hub_default_context_path,
            model="opus-4.5"
        )
        if result.success:
            return result.output
        # Include both error and output for debugging
        error_detail = result.error or result.output or "Unknown CLI error"
        logger.error("Claude CLI failed", error=error_detail, exit_code=result.exit_code)
        raise HTTPException(500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Claude endpoint error", error=str(e))
        raise HTTPException(500, detail=str(e))


@app.post("/cli/stock-tracker/cursor/opus-4.5")
async def cli_stock_tracker_cursor_opus45(request: CLIMessageRequest):
    """Stock Tracker + Cursor Opus 4.5."""
    config = get_config()
    executor = get_cli_executor()
    try:
        result = await executor.execute(
            cli="cursor-agent",
            message=request.message,
            context_path=config.settings.ai_hub_default_context_path,
            model="opus-4.5"
        )
        if result.success:
            return result.output
        # Include both error and output for debugging
        error_detail = result.error or result.output or "Unknown CLI error"
        logger.error("Cursor CLI failed", error=error_detail, exit_code=result.exit_code)
        raise HTTPException(500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Cursor endpoint error", error=str(e))
        raise HTTPException(500, detail=str(e))


# ===========================================
# Telegram AI Agent - Stock Analysis Endpoint
# ===========================================
# Uses cursor-agent with context from /home/azureuser/stock-tracker/
# Instructions, rules, and skills are read from context folder files.
# ===========================================

@app.post("/cli/telegram-agent/cursor/sonnet-4.5")
async def cli_telegram_agent_cursor_sonnet45(request: CLIMessageRequest):
    """
    Telegram AI Chat Agent - Stock analysis assistant (PRODUCTION).
    
    Uses Cursor Agent with Sonnet 4.5 model.
    Reads instructions from context folder: /home/azureuser/stock-tracker/
    
    Version: Uses telegram_agent_v2
    """
    config = get_config()
    executor = get_cli_executor()
    
    try:
        # Production uses v1 - change to telegram_agent_v2 when ready to promote
        result = await telegram_agent_v2(request.message, config, executor)
        if result.success:
            return result.output
        # Include both error and output for debugging
        error_detail = result.error or result.output or "Unknown CLI error"
        logger.error("Telegram Agent CLI failed", error=error_detail, exit_code=result.exit_code)
        raise HTTPException(500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Telegram Agent endpoint error", error=str(e))
        raise HTTPException(500, detail=str(e))


@app.post("/cli/telegram-agent-test/cursor/sonnet-4.5")
async def cli_telegram_agent_test_cursor_sonnet45(request: CLIMessageRequest):
    """
    Telegram AI Chat Agent TEST - For testing without affecting production.
    
    Uses Cursor Agent with Sonnet 4.5 model.
    Reads instructions from context folder: /home/azureuser/stock-tracker/
    
    Version: Uses telegram_agent_v2 (latest development version)
    """
    config = get_config()
    executor = get_cli_executor()
    
    try:
        # Test uses v2 - always the latest development version
        result = await telegram_agent_v2(request.message, config, executor)
        if result.success:
            return result.output
        # Include both error and output for debugging
        error_detail = result.error or result.output or "Unknown CLI error"
        logger.error("Telegram Agent Test CLI failed", error=error_detail, exit_code=result.exit_code)
        raise HTTPException(500, detail=error_detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Telegram Agent Test endpoint error", error=str(e))
        raise HTTPException(500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)





