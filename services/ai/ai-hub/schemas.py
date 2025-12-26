"""
Pydantic schemas for AI Hub request/response models.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Request payload for /api/chat endpoint."""
    
    model_id: str = Field(
        ...,
        description="Model identifier (e.g., api-stockandcryptotracker-google-gemini-3-flash)",
        examples=["api-stockandcryptotracker-google-gemini-3-flash"]
    )
    message: str = Field(
        ...,
        description="The message to send to the AI model",
        min_length=1
    )
    system_prompt: Optional[str] = Field(
        None,
        description="Optional system prompt to guide the AI's behavior"
    )
    caller_service: Optional[str] = Field(
        None,
        description="Name of the calling service for logging (e.g., twelvedata-worker)",
        examples=["twelvedata-worker", "alphavantage-worker", "frontend"]
    )


class TokenUsage(BaseModel):
    """Token usage information."""
    
    input: int = Field(..., description="Number of input tokens")
    output: int = Field(..., description="Number of output tokens")
    total: int = Field(..., description="Total tokens used")


class ChatSuccessResponse(BaseModel):
    """Successful response from /api/chat endpoint."""
    
    success: bool = Field(True, description="Whether the request succeeded")
    request_id: UUID = Field(default_factory=uuid4, description="Unique request identifier")
    response: str = Field(..., description="The AI model's response")
    model_id: str = Field(..., description="The model that generated the response")
    tokens_used: TokenUsage = Field(..., description="Token usage statistics")
    duration_ms: int = Field(..., description="Request duration in milliseconds")


class ChatErrorResponse(BaseModel):
    """Error response from /api/chat endpoint."""
    
    success: bool = Field(False, description="Always false for errors")
    request_id: UUID = Field(default_factory=uuid4, description="Unique request identifier")
    error: str = Field(..., description="Error message")
    error_code: str = Field(..., description="Error code for programmatic handling")
    model_id: Optional[str] = Field(None, description="The model that was requested")
    rate_limit_type: Optional[str] = Field(
        None, 
        description="Type of rate limit hit (RPM, TPM, RPD)",
        examples=["RPM", "TPM", "RPD"]
    )
    retry_after_seconds: Optional[int] = Field(
        None,
        description="Seconds to wait before retrying (for rate limit errors)"
    )


class HealthResponse(BaseModel):
    """Health check response."""
    
    status: str = Field(..., description="Health status", examples=["healthy", "unhealthy"])
    service: str = Field("ai-hub", description="Service name")
    version: str = Field("1.0.0", description="Service version")
    models_registered: int = Field(..., description="Number of registered AI models")
    database_connected: bool = Field(..., description="Database connection status")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ModelInfo(BaseModel):
    """Information about a registered model."""
    
    model_id: str
    model_type: str  # "api" or "cli"
    company: str
    model_name: str
    has_api_key: bool


class ModelsListResponse(BaseModel):
    """Response listing all registered models."""
    
    models: list[ModelInfo]
    total: int


# Error codes
class ErrorCodes:
    """Standard error codes for the AI Hub."""
    
    MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
    INVALID_REQUEST = "INVALID_REQUEST"
    RATE_LIMIT_EXHAUSTED = "RATE_LIMIT_EXHAUSTED"
    RATE_LIMIT_PRE_CHECK = "RATE_LIMIT_PRE_CHECK"
    API_KEY_MISSING = "API_KEY_MISSING"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    TIMEOUT = "TIMEOUT"
    INTERNAL_ERROR = "INTERNAL_ERROR"


