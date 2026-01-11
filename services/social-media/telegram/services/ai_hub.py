"""AI Hub client for calling the governed AI endpoint."""

import httpx
from typing import Optional

from config import AI_HUB_URL, AI_HUB_API_KEY, AI_HUB_ENDPOINT


class AIHubClient:
    """Client for calling AI Hub endpoints."""
    
    def __init__(self):
        self.base_url = AI_HUB_URL
        self.api_key = AI_HUB_API_KEY
        self.endpoint = AI_HUB_ENDPOINT
        self.timeout = 300.0  # 5 minutes timeout for AI responses (matches AI Hub CLI timeout)
    
    async def chat(self, message: str) -> str:
        """
        Send a message to the AI Hub and get a response.
        
        Args:
            message: The user's message
            
        Returns:
            The AI response text, or an error message
        """
        url = f"{self.base_url}{self.endpoint}"
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key
        }
        payload = {"message": message}
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload, headers=headers)
                
                if response.status_code == 200:
                    # Response could be plain text or JSON
                    content_type = response.headers.get("content-type", "")
                    if "application/json" in content_type:
                        data = response.json()
                        # Handle various response formats
                        if isinstance(data, str):
                            return data
                        elif isinstance(data, dict):
                            return data.get("response") or data.get("output") or data.get("data") or str(data)
                        return str(data)
                    else:
                        return response.text
                
                elif response.status_code == 401:
                    return "⚠️ Authentication error. Please contact support."
                
                elif response.status_code == 429:
                    return "⚠️ Too many requests. Please wait a moment and try again."
                
                elif response.status_code >= 500:
                    return "⚠️ AI service is temporarily unavailable. Please try again later."
                
                else:
                    return f"⚠️ Error: {response.status_code} - {response.text[:200]}"
                    
        except httpx.TimeoutException:
            return "⚠️ Request timed out. The AI is taking too long to respond. Please try a simpler question."
        
        except httpx.ConnectError:
            return "⚠️ Cannot connect to AI service. Please try again later."
        
        except Exception as e:
            return f"⚠️ Unexpected error: {str(e)[:100]}"
    
    async def health_check(self) -> bool:
        """Check if AI Hub is healthy."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/health/live")
                return response.status_code == 200
        except Exception:
            return False

