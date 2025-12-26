"""
Abstract base classes for AI model clients.
Supports both API-based and CLI-based models.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ModelResponse:
    """Response from an AI model."""
    
    text: str
    tokens_input: int = 0
    tokens_output: int = 0
    model_name: str = ""
    raw_response: Optional[dict] = None


class BaseModelClient(ABC):
    """Abstract base class for all AI model clients."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
    
    @abstractmethod
    async def generate(
        self, 
        message: str, 
        system_prompt: Optional[str] = None
    ) -> ModelResponse:
        """
        Generate a response from the AI model.
        
        Args:
            message: The user message to send
            system_prompt: Optional system prompt to guide behavior
            
        Returns:
            ModelResponse with the generated text and token usage
        """
        pass
    
    @abstractmethod
    def estimate_tokens(self, text: str) -> int:
        """
        Estimate the number of tokens in a text string.
        Used for pre-request rate limit checking.
        
        Args:
            text: The text to estimate tokens for
            
        Returns:
            Estimated token count
        """
        pass
    
    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name for logging."""
        pass


class APIModelClient(BaseModelClient):
    """Base class for API-based AI models (Gemini, OpenAI, etc.)."""
    
    def __init__(self, api_key: Optional[str] = None, timeout: int = 30):
        super().__init__(api_key)
        self.timeout = timeout
    
    def estimate_tokens(self, text: str) -> int:
        """
        Simple token estimation: ~4 characters per token.
        Override in subclasses for more accurate estimation.
        """
        return max(1, len(text) // 4)


class CLIModelClient(BaseModelClient):
    """
    Base class for CLI-based AI models (future: claude-cli, llm-cli).
    Executes AI via subprocess calls to CLI tools.
    """
    
    def __init__(self, cli_path: str, api_key: Optional[str] = None):
        super().__init__(api_key)
        self.cli_path = cli_path
    
    def estimate_tokens(self, text: str) -> int:
        """Simple token estimation for CLI models."""
        return max(1, len(text) // 4)
    
    async def generate(
        self, 
        message: str, 
        system_prompt: Optional[str] = None
    ) -> ModelResponse:
        """
        Execute CLI command to generate response.
        To be implemented when CLI models are added.
        """
        raise NotImplementedError("CLI model support coming soon")
    
    @property
    def model_name(self) -> str:
        return "cli-model"


