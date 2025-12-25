"""
Rate Limiter Service

Implements rate limiting per Google Gemini documentation:
- RPM (Requests Per Minute)
- TPM (Tokens Per Minute) 
- RPD (Requests Per Day) - resets at midnight Pacific Time

Rate limits are tracked PER PROJECT (not per API key).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo
import structlog

from config import get_config, RateLimitConfig
from db.connection import DatabaseConnection

logger = structlog.get_logger(__name__)

# Pacific timezone for RPD reset
PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


@dataclass
class RateLimitStatus:
    """Result of a rate limit check."""
    
    can_proceed: bool
    wait_seconds: int = 0
    limit_type: Optional[str] = None  # "RPM", "TPM", "RPD"
    current_rpm: int = 0
    current_tpm: int = 0
    current_rpd: int = 0


@dataclass
class UsageStats:
    """Current usage statistics for a model."""
    
    requests_this_minute: int = 0
    tokens_this_minute: int = 0
    requests_today: int = 0


class RateLimiter:
    """
    Rate limiter that tracks usage per Google Cloud project.
    
    Features:
    - Pre-request checking to avoid hitting limits
    - Post-request tracking to update counters
    - Pacific timezone aware for RPD reset
    """
    
    def __init__(self):
        self._config = get_config()
    
    @staticmethod
    def _get_current_minute() -> datetime:
        """Get current minute window (truncated to minute)."""
        now = datetime.utcnow()
        return now.replace(second=0, microsecond=0)
    
    @staticmethod
    def _get_pacific_date() -> str:
        """Get current date in Pacific timezone for RPD tracking."""
        return datetime.now(PACIFIC_TZ).strftime("%Y-%m-%d")
    
    @staticmethod
    def _seconds_until_pacific_midnight() -> int:
        """Calculate seconds until midnight Pacific Time."""
        now = datetime.now(PACIFIC_TZ)
        midnight = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return int((midnight - now).total_seconds())
    
    async def get_current_usage(
        self, 
        project_id: str, 
        model_family: str
    ) -> UsageStats:
        """
        Get current usage statistics from database.
        
        Args:
            project_id: Google Cloud project ID
            model_family: Model family (e.g., "gemini-3-flash")
        """
        current_minute = self._get_current_minute()
        pacific_date = self._get_pacific_date()
        
        # Query minute stats
        minute_query = """
            SELECT requests_count, tokens_count
            FROM ai_hub_rate_tracking
            WHERE google_project_id = $1 
              AND model_family = $2
              AND minute_window = $3
        """
        
        # Query daily stats
        daily_query = """
            SELECT COALESCE(SUM(daily_requests), 0) as total_daily
            FROM ai_hub_rate_tracking
            WHERE google_project_id = $1 
              AND model_family = $2
              AND pacific_date = $3
        """
        
        try:
            minute_row = await DatabaseConnection.fetchrow(
                minute_query, project_id, model_family, current_minute
            )
            daily_row = await DatabaseConnection.fetchrow(
                daily_query, project_id, model_family, pacific_date
            )
            
            return UsageStats(
                requests_this_minute=minute_row['requests_count'] if minute_row else 0,
                tokens_this_minute=minute_row['tokens_count'] if minute_row else 0,
                requests_today=daily_row['total_daily'] if daily_row else 0,
            )
        except Exception as e:
            logger.warning("Failed to get usage stats, assuming zero", error=str(e))
            return UsageStats()
    
    async def check_rate_limit(
        self,
        project_id: str,
        model_family: str,
        estimated_tokens: int = 0
    ) -> RateLimitStatus:
        """
        Check if a request would exceed rate limits BEFORE making the API call.
        
        Args:
            project_id: Google Cloud project ID
            model_family: Model family (e.g., "gemini-3-flash")
            estimated_tokens: Estimated input tokens for TPM check
            
        Returns:
            RateLimitStatus indicating whether request can proceed
        """
        # Get rate limit config for this model
        rate_config = self._config.get_rate_limit(model_family)
        if rate_config is None:
            # No rate limits configured, allow
            return RateLimitStatus(can_proceed=True)
        
        # Get current usage
        usage = await self.get_current_usage(project_id, model_family)
        
        # Check RPM (Requests Per Minute)
        if usage.requests_this_minute >= rate_config.rpm_limit:
            logger.warning(
                "RPM limit would be exceeded",
                current=usage.requests_this_minute,
                limit=rate_config.rpm_limit
            )
            return RateLimitStatus(
                can_proceed=False,
                wait_seconds=60,
                limit_type="RPM",
                current_rpm=usage.requests_this_minute,
                current_tpm=usage.tokens_this_minute,
                current_rpd=usage.requests_today,
            )
        
        # Check TPM (Tokens Per Minute)
        if usage.tokens_this_minute + estimated_tokens >= rate_config.tpm_limit:
            logger.warning(
                "TPM limit would be exceeded",
                current=usage.tokens_this_minute,
                estimated=estimated_tokens,
                limit=rate_config.tpm_limit
            )
            return RateLimitStatus(
                can_proceed=False,
                wait_seconds=60,
                limit_type="TPM",
                current_rpm=usage.requests_this_minute,
                current_tpm=usage.tokens_this_minute,
                current_rpd=usage.requests_today,
            )
        
        # Check RPD (Requests Per Day)
        if usage.requests_today >= rate_config.rpd_limit:
            wait_seconds = self._seconds_until_pacific_midnight()
            logger.warning(
                "RPD limit would be exceeded",
                current=usage.requests_today,
                limit=rate_config.rpd_limit,
                reset_in_seconds=wait_seconds
            )
            return RateLimitStatus(
                can_proceed=False,
                wait_seconds=wait_seconds,
                limit_type="RPD",
                current_rpm=usage.requests_this_minute,
                current_tpm=usage.tokens_this_minute,
                current_rpd=usage.requests_today,
            )
        
        # All checks passed
        return RateLimitStatus(
            can_proceed=True,
            current_rpm=usage.requests_this_minute,
            current_tpm=usage.tokens_this_minute,
            current_rpd=usage.requests_today,
        )
    
    async def record_usage(
        self,
        project_id: str,
        model_family: str,
        tokens_used: int
    ) -> None:
        """
        Record API usage after a successful request.
        
        Args:
            project_id: Google Cloud project ID
            model_family: Model family (e.g., "gemini-3-flash")
            tokens_used: Total tokens used in the request
        """
        current_minute = self._get_current_minute()
        pacific_date = self._get_pacific_date()
        
        # Upsert minute tracking record
        upsert_query = """
            INSERT INTO ai_hub_rate_tracking 
                (google_project_id, model_family, minute_window, 
                 requests_count, tokens_count, pacific_date, daily_requests)
            VALUES ($1, $2, $3, 1, $4, $5, 1)
            ON CONFLICT (google_project_id, model_family, minute_window)
            DO UPDATE SET
                requests_count = ai_hub_rate_tracking.requests_count + 1,
                tokens_count = ai_hub_rate_tracking.tokens_count + $4,
                daily_requests = ai_hub_rate_tracking.daily_requests + 1,
                updated_at = NOW()
        """
        
        try:
            await DatabaseConnection.execute(
                upsert_query,
                project_id,
                model_family,
                current_minute,
                tokens_used,
                pacific_date
            )
            logger.debug(
                "Usage recorded",
                project_id=project_id,
                model_family=model_family,
                tokens=tokens_used
            )
        except Exception as e:
            logger.error("Failed to record usage", error=str(e))
    
    async def cleanup_old_tracking(self, days: int = 2) -> int:
        """
        Clean up rate tracking records older than specified days.
        Called periodically to prevent table bloat.
        
        Returns:
            Number of records deleted
        """
        query = """
            DELETE FROM ai_hub_rate_tracking
            WHERE minute_window < NOW() - INTERVAL '%s days'
        """ % days
        
        try:
            result = await DatabaseConnection.execute(query)
            # Parse DELETE count from result
            deleted = int(result.split()[-1]) if result else 0
            if deleted > 0:
                logger.info("Cleaned up old rate tracking records", deleted=deleted)
            return deleted
        except Exception as e:
            logger.error("Failed to cleanup rate tracking", error=str(e))
            return 0

