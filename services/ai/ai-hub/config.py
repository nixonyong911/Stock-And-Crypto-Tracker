"""
AI Hub Configuration

Handles model registry, API keys, and rate limit settings.
Model ID format: <type>-<username>-<company>-<model>
Example: api-stockandcryptotracker-google-gemini-3-flash
"""

import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""
    
    # Database (supports both DATABASE_URL and DATABASE_CONNECTION_STRING)
    database_url: str = ""
    database_connection_string: str = ""  # .NET format
    
    @property
    def db_url(self) -> str:
        """Get the database URL, converting from .NET format if needed."""
        if self.database_url:
            return self.database_url
        
        if self.database_connection_string:
            # Parse .NET connection string format:
            # User Id=xxx;Password=xxx;Server=xxx;Port=xxx;Database=xxx
            conn_str = self.database_connection_string
            parts = dict(p.split('=', 1) for p in conn_str.split(';') if '=' in p)
            
            user = parts.get('User Id', 'postgres')
            password = parts.get('Password', '')
            server = parts.get('Server', 'localhost')
            port = parts.get('Port', '5432')
            database = parts.get('Database', 'postgres')
            
            # URL encode password for special characters
            from urllib.parse import quote_plus
            encoded_password = quote_plus(password)
            
            return f"postgresql://{user}:{encoded_password}@{server}:{port}/{database}"
        
        return "postgresql://postgres:postgres@localhost:5432/postgres"
    
    # Google Cloud Project (for rate limit tracking - limits are per project)
    google_cloud_project_id: str = "default-project"
    
    # Model registry (comma-separated list of model IDs)
    ai_hub_models: str = "api-stockandcryptotracker-google-gemini-3-flash"
    
    # Rate limits (Free tier defaults per Google docs)
    ai_hub_gemini_rpm_limit: int = 15  # Requests per minute
    ai_hub_gemini_tpm_limit: int = 1000000  # Tokens per minute
    ai_hub_gemini_rpd_limit: int = 1500  # Requests per day
    
    # Retry configuration
    ai_hub_max_retries: int = 3
    ai_hub_timeout_seconds: int = 30
    
    # Log settings
    log_truncation_length: int = 500
    log_retention_days: int = 7
    
    # ===========================================
    # CLI Execution Settings
    # ===========================================
    # CLI prefix - prepended to all CLI commands
    # Production (empty): claude -p "msg" -> direct execution
    # Local dev (SSH):    ssh user@host claude -p "msg" -> via SSH
    ai_hub_cli_prefix: str = ""  # Empty = direct, or SSH command for local dev
    
    # Default context path on VM
    ai_hub_default_context_path: str = "/mnt/stock-tracker"
    
    # CLI timeout (CLI calls can take longer than API calls)
    ai_hub_cli_timeout_seconds: int = 120
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@dataclass
class ModelConfig:
    """Configuration for a single AI model."""
    
    model_id: str  # Full ID: api-stockandcryptotracker-google-gemini-3-flash
    model_type: str  # "api" or "cli"
    username: str  # e.g., "stockandcryptotracker"
    company: str  # e.g., "google"
    model_name: str  # e.g., "gemini-3-flash"
    api_key: Optional[str] = None
    
    @classmethod
    def from_model_id(cls, model_id: str) -> "ModelConfig":
        """
        Parse model ID into components.
        Format: <type>-<username>-<company>-<model>
        Example: api-stockandcryptotracker-google-gemini-3-flash
        """
        parts = model_id.split("-", 3)  # Split into max 4 parts
        if len(parts) < 4:
            raise ValueError(
                f"Invalid model_id format: {model_id}. "
                f"Expected: <type>-<username>-<company>-<model>"
            )
        
        model_type, username, company, model_name = parts
        
        if model_type not in ("api", "cli"):
            raise ValueError(f"Invalid model type: {model_type}. Must be 'api' or 'cli'")
        
        return cls(
            model_id=model_id,
            model_type=model_type,
            username=username,
            company=company,
            model_name=model_name,
        )
    
    def get_env_key_name(self) -> str:
        """
        Get the environment variable name for this model's API key.
        Example: api-stockandcryptotracker-google-gemini-3-flash 
                 -> AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH
        """
        normalized = self.model_id.upper().replace("-", "_")
        return f"AI_KEY_{normalized}"
    
    def load_api_key(self) -> Optional[str]:
        """Load API key from environment variable."""
        env_key = self.get_env_key_name()
        self.api_key = os.environ.get(env_key)
        return self.api_key


@dataclass
class RateLimitConfig:
    """Rate limit configuration for a model family."""
    
    rpm_limit: int  # Requests per minute
    tpm_limit: int  # Tokens per minute
    rpd_limit: int  # Requests per day


@dataclass
class AIHubConfig:
    """Complete AI Hub configuration."""
    
    settings: Settings
    models: Dict[str, ModelConfig] = field(default_factory=dict)
    rate_limits: Dict[str, RateLimitConfig] = field(default_factory=dict)
    
    @classmethod
    def load(cls) -> "AIHubConfig":
        """Load configuration from environment."""
        settings = Settings()
        config = cls(settings=settings)
        
        # Parse model IDs from comma-separated list
        model_ids = [m.strip() for m in settings.ai_hub_models.split(",") if m.strip()]
        
        for model_id in model_ids:
            try:
                model_config = ModelConfig.from_model_id(model_id)
                model_config.load_api_key()
                config.models[model_id] = model_config
                
                # Set up rate limits for Gemini models
                if model_config.company == "google":
                    config.rate_limits[model_config.model_name] = RateLimitConfig(
                        rpm_limit=settings.ai_hub_gemini_rpm_limit,
                        tpm_limit=settings.ai_hub_gemini_tpm_limit,
                        rpd_limit=settings.ai_hub_gemini_rpd_limit,
                    )
            except ValueError as e:
                print(f"Warning: Skipping invalid model config: {e}")
        
        return config
    
    def get_model(self, model_id: str) -> Optional[ModelConfig]:
        """Get model configuration by ID."""
        return self.models.get(model_id)
    
    def get_rate_limit(self, model_name: str) -> Optional[RateLimitConfig]:
        """Get rate limit configuration for a model family."""
        return self.rate_limits.get(model_name)
    
    def list_models(self) -> list[str]:
        """List all registered model IDs."""
        return list(self.models.keys())


# Global config instance (lazy loaded)
_config: Optional[AIHubConfig] = None


def get_config() -> AIHubConfig:
    """Get or create the global configuration instance."""
    global _config
    if _config is None:
        _config = AIHubConfig.load()
    return _config





