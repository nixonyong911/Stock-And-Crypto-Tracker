"""
AI Hub Service - Main FastAPI Application

A multi-model AI gateway that provides:
- Google Gemini API access (with future support for other providers)
- Rate limiting (RPM/TPM/RPD per Google project)
- Automatic retry with exponential backoff
- Request/response logging with 7-day retention
"""

import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Union
from uuid import uuid4

import structlog
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

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
from services.rate_limiter import RateLimiter
from services.retry_handler import RetryHandler, RetryResult
from services.logger import AIHubLogger
from services.cli_executor import get_cli_executor

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
rate_limiter = RateLimiter()
retry_handler = RetryHandler()
ai_logger = AIHubLogger()


async def cleanup_task():
    """Background task to clean up old logs and rate tracking data."""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            await ai_logger.cleanup_old_logs()
            await rate_limiter.cleanup_old_tracking()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Cleanup task error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting AI Hub Service")
    
    # Initialize database connection pool
    await DatabaseConnection.get_pool()
    
    # Ensure tables exist (fallback if EF Core migration not run)
    try:
        await ensure_tables_exist()
    except Exception as e:
        logger.warning("Could not ensure tables", error=str(e))
    
    # Start cleanup task
    cleanup = asyncio.create_task(cleanup_task())
    
    # Initialize model registry
    registry = get_registry()
    models = registry.list_models()
    logger.info("AI Hub ready", models_registered=len(models))
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Hub Service")
    cleanup.cancel()
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
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    """
    Send a message to an AI model and get a response.
    
    This endpoint handles:
    - Model routing based on model_id
    - Pre-request rate limit checking
    - Automatic retry on transient errors
    - Request/response logging
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
        
        # Log the error
        background_tasks.add_task(
            ai_logger.log_error,
            request_id=request_id,
            model_id=request.model_id,
            caller_service=request.caller_service,
            google_project_id=config.settings.google_cloud_project_id,
            message=request.message,
            error_message=error_response.error,
            status="client_error",
            http_status_code=400,
        )
        
        raise HTTPException(status_code=400, detail=error_response.model_dump())
    
    # Get model config for rate limiting
    model_config = config.get_model(request.model_id)
    model_family = model_config.model_name if model_config else "unknown"
    project_id = config.settings.google_cloud_project_id
    
    # Estimate tokens for pre-check
    estimated_tokens = client.estimate_tokens(request.message)
    if request.system_prompt:
        estimated_tokens += client.estimate_tokens(request.system_prompt)
    
    # Pre-request rate limit check
    rate_status = await rate_limiter.check_rate_limit(
        project_id=project_id,
        model_family=model_family,
        estimated_tokens=estimated_tokens
    )
    
    if not rate_status.can_proceed:
        duration_ms = int((time.time() - start_time) * 1000)
        error_response = ChatErrorResponse(
            request_id=request_id,
            error=f"Rate limit exceeded ({rate_status.limit_type})",
            error_code=ErrorCodes.RATE_LIMIT_PRE_CHECK,
            model_id=request.model_id,
            rate_limit_type=rate_status.limit_type,
            retry_after_seconds=rate_status.wait_seconds,
        )
        
        # Log the rate limit
        background_tasks.add_task(
            ai_logger.log_error,
            request_id=request_id,
            model_id=request.model_id,
            caller_service=request.caller_service,
            google_project_id=project_id,
            message=request.message,
            error_message=error_response.error,
            status="rate_limited",
            http_status_code=429,
            rate_limit_type=rate_status.limit_type,
            duration_ms=duration_ms,
        )
        
        raise HTTPException(status_code=429, detail=error_response.model_dump())
    
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
        
        # Record usage for rate limiting
        total_tokens = model_response.tokens_input + model_response.tokens_output
        await rate_limiter.record_usage(
            project_id=project_id,
            model_family=model_family,
            tokens_used=total_tokens
        )
        
        # Log success
        background_tasks.add_task(
            ai_logger.log_success,
            request_id=request_id,
            model_id=request.model_id,
            caller_service=request.caller_service,
            google_project_id=project_id,
            message=request.message,
            response=model_response.text,
            tokens_input=model_response.tokens_input,
            tokens_output=model_response.tokens_output,
            duration_ms=duration_ms,
            retry_count=result.retry_count,
        )
        
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
        
        # Log the error
        background_tasks.add_task(
            ai_logger.log_error,
            request_id=request_id,
            model_id=request.model_id,
            caller_service=request.caller_service,
            google_project_id=project_id,
            message=request.message,
            error_message=error_msg,
            status=status,
            http_status_code=result.http_status,
            rate_limit_type=error_response.rate_limit_type,
            duration_ms=duration_ms,
            retry_count=result.retry_count,
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


@app.get("/api/stats")
async def get_stats(hours: int = 24):
    """Get usage statistics for the last N hours."""
    return await ai_logger.get_stats(hours=hours)


@app.get("/api/errors")
async def get_recent_errors(model_id: str = None, limit: int = 50):
    """Get recent error logs."""
    return await ai_logger.get_recent_errors(model_id=model_id, limit=limit)


# ===========================================
# CLI Endpoints - Pre-configured agents
# ===========================================
# Format: /<type>/<instruction-folder>/<agent>/<mode>
# - type: cli or api
# - instruction-folder: maps to /mnt/<folder>
# - agent: claude, cursor, etc.
# - mode: opus-4.5, sonnet-4, default, etc.

CLI_ENDPOINTS = [
    {
        "path": "/cli/stock-tracker/claude/opus-4.5",
        "instruction_folder": "stock-tracker",
        "context_path": "/mnt/stock-tracker",
        "agent": "claude",
        "mode": "opus-4.5",
        "description": "Stock Tracker analysis with Claude Opus 4.5"
    },
    {
        "path": "/cli/stock-tracker/cursor/opus-4.5",
        "instruction_folder": "stock-tracker",
        "context_path": "/mnt/stock-tracker",
        "agent": "cursor",
        "mode": "opus-4.5",
        "description": "Stock Tracker analysis with Cursor Opus 4.5"
    }
]


@app.get("/cli")
async def list_cli_endpoints():
    """Discovery endpoint - list all available CLI endpoints."""
    return {
        "format": "/<type>/<instruction-folder>/<agent>/<mode>",
        "endpoints": CLI_ENDPOINTS,
        "total": len(CLI_ENDPOINTS)
    }


@app.post("/cli/stock-tracker/claude/opus-4.5")
async def cli_stock_tracker_claude_opus45(request: CLIMessageRequest):
    """Stock Tracker + Claude Opus 4.5."""
    executor = get_cli_executor()
    result = await executor.execute(
        cli="claude",
        message=request.message,
        context_path="/mnt/stock-tracker",
        model="opus-4.5"
    )
    if result.success:
        return result.output
    raise HTTPException(500, detail=result.error)


@app.post("/cli/stock-tracker/cursor/opus-4.5")
async def cli_stock_tracker_cursor_opus45(request: CLIMessageRequest):
    """Stock Tracker + Cursor Opus 4.5."""
    executor = get_cli_executor()
    result = await executor.execute(
        cli="cursor-agent",
        message=request.message,
        context_path="/mnt/stock-tracker",
        model="opus-4.5"
    )
    if result.success:
        return result.output
    raise HTTPException(500, detail=result.error)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)





