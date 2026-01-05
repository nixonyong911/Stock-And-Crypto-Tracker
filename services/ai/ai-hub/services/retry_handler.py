"""
Retry Handler with Exponential Backoff

Handles transient errors from AI providers:
- 429 Too Many Requests (Rate Limit)
- 500 Internal Server Error
- 503 Service Unavailable
- Timeouts
"""

import asyncio
import random
from dataclasses import dataclass
from typing import Callable, TypeVar, Optional, Any
from functools import wraps
import structlog

logger = structlog.get_logger(__name__)

T = TypeVar("T")


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    
    max_retries: int = 3
    base_delay: float = 1.0  # Base delay in seconds
    max_delay: float = 30.0  # Maximum delay in seconds
    exponential_base: float = 2.0  # Exponential backoff base
    jitter: bool = True  # Add random jitter to prevent thundering herd


@dataclass
class RetryResult:
    """Result of a retry operation."""
    
    success: bool
    result: Any = None
    error: Optional[Exception] = None
    retry_count: int = 0
    http_status: Optional[int] = None
    retry_after: Optional[int] = None


class RetryableError(Exception):
    """Base class for retryable errors."""
    
    def __init__(
        self, 
        message: str, 
        http_status: Optional[int] = None,
        retry_after: Optional[int] = None
    ):
        super().__init__(message)
        self.http_status = http_status
        self.retry_after = retry_after


class RateLimitError(RetryableError):
    """429 Too Many Requests error."""
    pass


class ServerError(RetryableError):
    """500 Internal Server Error."""
    pass


class ServiceUnavailableError(RetryableError):
    """503 Service Unavailable error."""
    pass


class TimeoutError(RetryableError):
    """Request timeout error."""
    pass


class NonRetryableError(Exception):
    """Errors that should not be retried (400, 401, 403)."""
    
    def __init__(self, message: str, http_status: Optional[int] = None):
        super().__init__(message)
        self.http_status = http_status


# Retry strategies per error type
RETRY_STRATEGIES = {
    429: {"max_retries": 3, "base_delay": 1.0, "exponential_base": 2.0},  # 1s, 2s, 4s, 8s
    500: {"max_retries": 2, "base_delay": 0.5, "exponential_base": 2.0},  # 0.5s, 1s
    503: {"max_retries": 2, "base_delay": 1.0, "exponential_base": 2.0},  # 1s, 2s
    408: {"max_retries": 1, "base_delay": 1.0, "exponential_base": 1.0},  # 1s (single retry)
}


class RetryHandler:
    """
    Handles retries with exponential backoff for AI API calls.
    
    Strategies per error type:
    - 429 Rate Limit: 3 retries, backoff 1s, 2s, 4s, 8s
    - 500 Server Error: 2 retries, backoff 0.5s, 1s
    - 503 Unavailable: 2 retries, backoff 1s, 2s
    - Timeout: 1 retry, 1s delay
    """
    
    def __init__(self, config: Optional[RetryConfig] = None):
        self.config = config or RetryConfig()
    
    def _calculate_delay(
        self, 
        retry_count: int, 
        base_delay: float,
        exponential_base: float,
        retry_after: Optional[int] = None
    ) -> float:
        """
        Calculate delay for next retry with exponential backoff.
        
        If retry_after is provided (from API response header), use it.
        Otherwise, calculate exponential backoff with jitter.
        """
        if retry_after:
            # Use server-provided retry delay
            return float(retry_after)
        
        # Exponential backoff
        delay = base_delay * (exponential_base ** retry_count)
        delay = min(delay, self.config.max_delay)
        
        # Add jitter (±25%)
        if self.config.jitter:
            jitter = delay * 0.25 * (2 * random.random() - 1)
            delay += jitter
        
        return max(0.1, delay)  # Minimum 100ms
    
    def _get_strategy_for_status(self, status: int) -> dict:
        """Get retry strategy for HTTP status code."""
        return RETRY_STRATEGIES.get(status, self.config.__dict__)
    
    def _is_retryable(self, error: Exception) -> tuple[bool, Optional[int]]:
        """
        Check if an error is retryable.
        
        Returns:
            (is_retryable, http_status)
        """
        if isinstance(error, RateLimitError):
            return True, 429
        if isinstance(error, ServerError):
            return True, 500
        if isinstance(error, ServiceUnavailableError):
            return True, 503
        if isinstance(error, TimeoutError):
            return True, 408
        if isinstance(error, RetryableError):
            return True, error.http_status
        if isinstance(error, NonRetryableError):
            return False, error.http_status
        
        # Check for common HTTP library errors
        error_str = str(error).lower()
        if "429" in error_str or "rate limit" in error_str:
            return True, 429
        if "500" in error_str or "internal server error" in error_str:
            return True, 500
        if "503" in error_str or "service unavailable" in error_str:
            return True, 503
        if "timeout" in error_str or "timed out" in error_str:
            return True, 408
        
        # Don't retry unknown errors
        return False, None
    
    async def execute_with_retry(
        self,
        func: Callable[[], T],
        operation_name: str = "api_call"
    ) -> RetryResult:
        """
        Execute a function with retry logic.
        
        Args:
            func: Async function to execute
            operation_name: Name for logging
            
        Returns:
            RetryResult with success status and result/error
        """
        retry_count = 0
        last_error: Optional[Exception] = None
        last_status: Optional[int] = None
        retry_after: Optional[int] = None
        
        while True:
            try:
                result = await func()
                return RetryResult(
                    success=True,
                    result=result,
                    retry_count=retry_count
                )
                
            except Exception as e:
                last_error = e
                is_retryable, status = self._is_retryable(e)
                last_status = status
                
                # Get retry-after from error if available
                if hasattr(e, 'retry_after'):
                    retry_after = e.retry_after
                
                if not is_retryable:
                    logger.warning(
                        "Non-retryable error",
                        operation=operation_name,
                        error=str(e),
                        http_status=status
                    )
                    return RetryResult(
                        success=False,
                        error=e,
                        retry_count=retry_count,
                        http_status=status
                    )
                
                # Get retry strategy for this status
                strategy = self._get_strategy_for_status(status or 500)
                max_retries = strategy.get("max_retries", self.config.max_retries)
                
                if retry_count >= max_retries:
                    logger.error(
                        "Max retries exceeded",
                        operation=operation_name,
                        retry_count=retry_count,
                        http_status=status,
                        error=str(e)
                    )
                    return RetryResult(
                        success=False,
                        error=e,
                        retry_count=retry_count,
                        http_status=status,
                        retry_after=retry_after
                    )
                
                # Calculate delay
                delay = self._calculate_delay(
                    retry_count,
                    strategy.get("base_delay", self.config.base_delay),
                    strategy.get("exponential_base", self.config.exponential_base),
                    retry_after
                )
                
                logger.warning(
                    "Retrying after error",
                    operation=operation_name,
                    retry_count=retry_count + 1,
                    max_retries=max_retries,
                    delay_seconds=delay,
                    http_status=status,
                    error=str(e)
                )
                
                await asyncio.sleep(delay)
                retry_count += 1


def classify_http_error(status_code: int, message: str = "") -> Exception:
    """
    Classify an HTTP status code into the appropriate error type.
    
    Args:
        status_code: HTTP status code
        message: Error message
        
    Returns:
        Appropriate exception type
    """
    if status_code == 429:
        return RateLimitError(message or "Rate limit exceeded", http_status=429)
    if status_code == 500:
        return ServerError(message or "Internal server error", http_status=500)
    if status_code == 503:
        return ServiceUnavailableError(message or "Service unavailable", http_status=503)
    if status_code in (408, 504):
        return TimeoutError(message or "Request timeout", http_status=status_code)
    if 400 <= status_code < 500:
        return NonRetryableError(message or f"Client error: {status_code}", http_status=status_code)
    
    return RetryableError(message or f"HTTP error: {status_code}", http_status=status_code)
















