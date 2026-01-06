"""
Google Gemini API client implementation.
Supports Gemini 3 Flash and other Gemini models.
"""

import asyncio
from typing import Optional
import structlog
from google import genai
from google.genai import types

from models.base import APIModelClient, ModelResponse

logger = structlog.get_logger(__name__)


class GeminiClient(APIModelClient):
    """
    Google Gemini API client.
    
    Supports:
    - gemini-3-flash (default)
    - gemini-2.5-flash
    - gemini-2.5-pro
    """
    
    # Model name mapping
    MODEL_MAP = {
        "gemini-3-flash": "gemini-2.0-flash",  # Use latest stable
        "gemini-2.5-flash": "gemini-1.5-flash",
        "gemini-2.5-pro": "gemini-1.5-pro",
        "gemini-2.0-flash": "gemini-2.0-flash",
        "gemini-1.5-flash": "gemini-1.5-flash",
        "gemini-1.5-pro": "gemini-1.5-pro",
    }
    
    def __init__(
        self, 
        api_key: str, 
        model_name: str = "gemini-3-flash",
        timeout: int = 30
    ):
        super().__init__(api_key, timeout)
        self._model_name = model_name
        self._actual_model = self.MODEL_MAP.get(model_name, "gemini-2.0-flash")
        
        # Initialize the Gemini client
        self._client = genai.Client(api_key=api_key)
        
        logger.info(
            "Gemini client initialized",
            model_name=model_name,
            actual_model=self._actual_model
        )
    
    @property
    def model_name(self) -> str:
        return self._model_name
    
    async def generate(
        self, 
        message: str, 
        system_prompt: Optional[str] = None
    ) -> ModelResponse:
        """
        Generate a response using Google Gemini.
        
        Args:
            message: The user message
            system_prompt: Optional system instruction
            
        Returns:
            ModelResponse with text and token counts
        """
        try:
            # Build the request
            contents = message
            
            # Configure generation
            config = types.GenerateContentConfig(
                system_instruction=system_prompt if system_prompt else None,
                temperature=0.7,
                max_output_tokens=2048,
            )
            
            # Make the API call (run sync call in executor for async)
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._client.models.generate_content(
                    model=self._actual_model,
                    contents=contents,
                    config=config,
                )
            )
            
            # Extract response text
            response_text = ""
            if response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    response_text = "".join(
                        part.text for part in candidate.content.parts if hasattr(part, 'text')
                    )
            
            # Extract token counts from usage metadata
            tokens_input = 0
            tokens_output = 0
            
            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                tokens_input = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
                tokens_output = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0
            
            logger.debug(
                "Gemini response generated",
                model=self._actual_model,
                tokens_input=tokens_input,
                tokens_output=tokens_output,
                response_length=len(response_text)
            )
            
            return ModelResponse(
                text=response_text,
                tokens_input=tokens_input,
                tokens_output=tokens_output,
                model_name=self._actual_model,
                raw_response={"candidates_count": len(response.candidates) if response.candidates else 0}
            )
            
        except Exception as e:
            logger.error(
                "Gemini API error",
                error=str(e),
                error_type=type(e).__name__,
                model=self._actual_model
            )
            raise
    
    def estimate_tokens(self, text: str) -> int:
        """
        Estimate tokens for Gemini models.
        Gemini uses ~4 characters per token on average.
        """
        return max(1, len(text) // 4)


















