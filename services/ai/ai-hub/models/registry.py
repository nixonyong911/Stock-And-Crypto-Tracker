"""
Model Registry - Routes requests to the correct AI model client.
"""

from typing import Dict, Optional
import structlog

from config import get_config, ModelConfig
from models.base import BaseModelClient
from models.google.gemini import GeminiClient

logger = structlog.get_logger(__name__)


class ModelRegistry:
    """
    Registry for AI model clients.
    Creates and caches model clients based on configuration.
    """
    
    def __init__(self):
        self._clients: Dict[str, BaseModelClient] = {}
        self._config = get_config()
    
    def get_client(self, model_id: str) -> Optional[BaseModelClient]:
        """
        Get or create a model client by model ID.
        
        Args:
            model_id: The full model ID (e.g., api-stockandcryptotracker-google-gemini-3-flash)
            
        Returns:
            The model client, or None if not found/configured
        """
        # Check cache first
        if model_id in self._clients:
            return self._clients[model_id]
        
        # Get model configuration
        model_config = self._config.get_model(model_id)
        if model_config is None:
            logger.warning("Model not found in registry", model_id=model_id)
            return None
        
        # Create the client based on company/type
        client = self._create_client(model_config)
        if client:
            self._clients[model_id] = client
            logger.info("Model client created and cached", model_id=model_id)
        
        return client
    
    def _create_client(self, config: ModelConfig) -> Optional[BaseModelClient]:
        """Create a model client based on configuration."""
        
        if config.api_key is None:
            logger.error(
                "API key not configured for model",
                model_id=config.model_id,
                expected_env_var=config.get_env_key_name()
            )
            return None
        
        # Route to correct client based on company
        if config.company == "google":
            return GeminiClient(
                api_key=config.api_key,
                model_name=config.model_name,
                timeout=self._config.settings.ai_hub_timeout_seconds
            )
        
        # Future: Add other providers
        # elif config.company == "openai":
        #     return OpenAIClient(...)
        # elif config.company == "anthropic":
        #     return AnthropicClient(...)
        
        logger.warning(
            "Unsupported AI company",
            company=config.company,
            model_id=config.model_id
        )
        return None
    
    def list_models(self) -> list[str]:
        """List all registered model IDs."""
        return self._config.list_models()
    
    def get_model_info(self, model_id: str) -> Optional[dict]:
        """Get information about a registered model."""
        config = self._config.get_model(model_id)
        if config is None:
            return None
        
        return {
            "model_id": config.model_id,
            "model_type": config.model_type,
            "company": config.company,
            "model_name": config.model_name,
            "has_api_key": config.api_key is not None,
        }


# Global registry instance
_registry: Optional[ModelRegistry] = None


def get_registry() -> ModelRegistry:
    """Get or create the global model registry."""
    global _registry
    if _registry is None:
        _registry = ModelRegistry()
    return _registry





