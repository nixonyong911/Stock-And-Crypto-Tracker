"""
AI Hub Logger Service

Logs all API requests and responses to the database.
- Message/response truncated to 500 characters
- 7-day retention with automatic cleanup
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
import structlog

from config import get_config
from db.connection import DatabaseConnection

logger = structlog.get_logger(__name__)


@dataclass
class LogEntry:
    """Data to log for an AI Hub request."""
    
    request_id: UUID
    model_id: str
    caller_service: Optional[str]
    google_project_id: str
    message: str
    response: Optional[str]
    tokens_input: int
    tokens_output: int
    duration_ms: int
    retry_count: int
    rate_limit_type: Optional[str]  # "RPM", "TPM", "RPD", or None
    status: str  # "success", "rate_limited", "server_error", etc.
    http_status_code: Optional[int]
    error_message: Optional[str]


class AIHubLogger:
    """
    Logs AI Hub requests to the database.
    
    Features:
    - Truncates message/response to configurable length (default 500)
    - Automatic 7-day cleanup
    - Async batch logging support (future)
    """
    
    def __init__(self, truncation_length: int = 500):
        config = get_config()
        self.truncation_length = config.settings.log_truncation_length
        self.retention_days = config.settings.log_retention_days
    
    def _truncate(self, text: Optional[str]) -> Optional[str]:
        """Truncate text to configured length."""
        if text is None:
            return None
        if len(text) <= self.truncation_length:
            return text
        return text[:self.truncation_length - 3] + "..."
    
    async def log_request(self, entry: LogEntry) -> None:
        """
        Log a request to the database.
        
        Args:
            entry: LogEntry with all request/response data
        """
        query = """
            INSERT INTO ai_hub_logs (
                request_id, model_id, caller_service, google_project_id,
                message_preview, response_preview,
                tokens_input, tokens_output, duration_ms, retry_count,
                rate_limit_type, status, http_status_code, error_message,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()
            )
        """
        
        try:
            await DatabaseConnection.execute(
                query,
                entry.request_id,
                entry.model_id,
                entry.caller_service,
                entry.google_project_id,
                self._truncate(entry.message),
                self._truncate(entry.response),
                entry.tokens_input,
                entry.tokens_output,
                entry.duration_ms,
                entry.retry_count,
                entry.rate_limit_type,
                entry.status,
                entry.http_status_code,
                entry.error_message,
            )
            logger.debug(
                "Request logged",
                request_id=str(entry.request_id),
                status=entry.status
            )
        except Exception as e:
            logger.error(
                "Failed to log request",
                request_id=str(entry.request_id),
                error=str(e)
            )
    
    async def log_success(
        self,
        request_id: UUID,
        model_id: str,
        caller_service: Optional[str],
        google_project_id: str,
        message: str,
        response: str,
        tokens_input: int,
        tokens_output: int,
        duration_ms: int,
        retry_count: int = 0,
    ) -> None:
        """Log a successful request."""
        await self.log_request(LogEntry(
            request_id=request_id,
            model_id=model_id,
            caller_service=caller_service,
            google_project_id=google_project_id,
            message=message,
            response=response,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            duration_ms=duration_ms,
            retry_count=retry_count,
            rate_limit_type=None,
            status="success",
            http_status_code=200,
            error_message=None,
        ))
    
    async def log_error(
        self,
        request_id: UUID,
        model_id: str,
        caller_service: Optional[str],
        google_project_id: str,
        message: str,
        error_message: str,
        status: str,
        http_status_code: Optional[int] = None,
        rate_limit_type: Optional[str] = None,
        duration_ms: int = 0,
        retry_count: int = 0,
    ) -> None:
        """Log a failed request."""
        await self.log_request(LogEntry(
            request_id=request_id,
            model_id=model_id,
            caller_service=caller_service,
            google_project_id=google_project_id,
            message=message,
            response=None,
            tokens_input=0,
            tokens_output=0,
            duration_ms=duration_ms,
            retry_count=retry_count,
            rate_limit_type=rate_limit_type,
            status=status,
            http_status_code=http_status_code,
            error_message=error_message,
        ))
    
    async def cleanup_old_logs(self) -> int:
        """
        Delete logs older than retention period.
        
        Returns:
            Number of records deleted
        """
        query = f"""
            DELETE FROM ai_hub_logs
            WHERE created_at < NOW() - INTERVAL '{self.retention_days} days'
        """
        
        try:
            result = await DatabaseConnection.execute(query)
            # Parse DELETE count from result
            deleted = int(result.split()[-1]) if result else 0
            if deleted > 0:
                logger.info(
                    "Cleaned up old logs",
                    deleted=deleted,
                    retention_days=self.retention_days
                )
            return deleted
        except Exception as e:
            logger.error("Failed to cleanup old logs", error=str(e))
            return 0
    
    async def get_recent_errors(
        self, 
        model_id: Optional[str] = None,
        limit: int = 50
    ) -> list[dict]:
        """
        Get recent error logs for monitoring.
        
        Args:
            model_id: Optional filter by model
            limit: Maximum number of records
            
        Returns:
            List of error log records
        """
        if model_id:
            query = """
                SELECT request_id, model_id, status, http_status_code, 
                       error_message, rate_limit_type, created_at
                FROM ai_hub_logs
                WHERE status != 'success' AND model_id = $1
                ORDER BY created_at DESC
                LIMIT $2
            """
            rows = await DatabaseConnection.fetch(query, model_id, limit)
        else:
            query = """
                SELECT request_id, model_id, status, http_status_code, 
                       error_message, rate_limit_type, created_at
                FROM ai_hub_logs
                WHERE status != 'success'
                ORDER BY created_at DESC
                LIMIT $1
            """
            rows = await DatabaseConnection.fetch(query, limit)
        
        return [dict(row) for row in rows]
    
    async def get_stats(self, hours: int = 24) -> dict:
        """
        Get usage statistics for the last N hours.
        
        Returns:
            Dictionary with counts by status, model, etc.
        """
        query = """
            SELECT 
                model_id,
                status,
                COUNT(*) as count,
                AVG(duration_ms) as avg_duration_ms,
                SUM(tokens_input) as total_tokens_input,
                SUM(tokens_output) as total_tokens_output
            FROM ai_hub_logs
            WHERE created_at > NOW() - INTERVAL '%s hours'
            GROUP BY model_id, status
            ORDER BY count DESC
        """ % hours
        
        try:
            rows = await DatabaseConnection.fetch(query)
            return {
                "period_hours": hours,
                "stats": [dict(row) for row in rows]
            }
        except Exception as e:
            logger.error("Failed to get stats", error=str(e))
            return {"period_hours": hours, "stats": [], "error": str(e)}





