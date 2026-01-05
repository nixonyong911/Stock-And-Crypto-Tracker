# AI Hub Integration Guide

How to consume the AI Hub service from any language.

---

## Endpoint

```
POST http://ai-hub:8080/api/chat
Content-Type: application/json
```

**Request:**
```json
{
  "model_id": "api-stockandcryptotracker-google-gemini-3-flash",
  "message": "Your message here",
  "system_prompt": "Optional system prompt",
  "caller_service": "your-service-name"
}
```

**Response:**
```json
{
  "success": true,
  "request_id": "uuid",
  "response": "AI response text",
  "tokens_used": { "input": 45, "output": 120, "total": 165 },
  "duration_ms": 850
}
```

---

## .NET Integration

```csharp
public class AiHubClient
{
    private readonly HttpClient _httpClient;
    
    public AiHubClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.BaseAddress = new Uri("http://ai-hub:8080");
    }
    
    public async Task<string?> AnalyzeAsync(string message, string systemPrompt = null)
    {
        var response = await _httpClient.PostAsJsonAsync("/api/chat", new
        {
            model_id = "api-stockandcryptotracker-google-gemini-3-flash",
            message,
            system_prompt = systemPrompt,
            caller_service = "my-worker"
        });
        
        if (!response.IsSuccessStatusCode) return null;
        
        var result = await response.Content.ReadFromJsonAsync<AiResponse>();
        return result?.Response;
    }
}

public record AiResponse(bool Success, string Response, int DurationMs);
```

**DI Setup:**
```csharp
builder.Services.AddHttpClient<AiHubClient>();
```

---

## Next.js / TypeScript Integration

```typescript
// lib/ai-hub.ts
interface ChatResponse {
  success: boolean;
  request_id: string;
  response?: string;
  error?: string;
  tokens_used?: { input: number; output: number; total: number };
  duration_ms?: number;
}

export async function analyzeWithAI(
  message: string,
  systemPrompt?: string
): Promise<ChatResponse> {
  const response = await fetch('http://ai-hub:8080/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: 'api-stockandcryptotracker-google-gemini-3-flash',
      message,
      system_prompt: systemPrompt,
      caller_service: 'frontend'
    })
  });
  return response.json();
}

// Usage
const result = await analyzeWithAI('Analyze AAPL pattern...', 'You are a trading analyst.');
if (result.success) {
  console.log(result.response);
}
```

---

## Python Integration

```python
import httpx

async def analyze_with_ai(message: str, system_prompt: str = None) -> dict:
    async with httpx.AsyncClient(base_url="http://ai-hub:8080") as client:
        response = await client.post(
            "/api/chat",
            json={
                "model_id": "api-stockandcryptotracker-google-gemini-3-flash",
                "message": message,
                "system_prompt": system_prompt,
                "caller_service": "python-service"
            },
            timeout=60.0
        )
        return response.json()

# Usage
result = await analyze_with_ai("Analyze this pattern...", "You are a trading analyst.")
```

---

## Go Integration

```go
package aihub

import (
    "bytes"
    "encoding/json"
    "net/http"
)

type ChatRequest struct {
    ModelID       string `json:"model_id"`
    Message       string `json:"message"`
    SystemPrompt  string `json:"system_prompt,omitempty"`
    CallerService string `json:"caller_service,omitempty"`
}

type ChatResponse struct {
    Success    bool   `json:"success"`
    Response   string `json:"response,omitempty"`
    Error      string `json:"error,omitempty"`
    DurationMs int    `json:"duration_ms,omitempty"`
}

func AnalyzeWithAI(message, systemPrompt string) (*ChatResponse, error) {
    req := ChatRequest{
        ModelID:       "api-stockandcryptotracker-google-gemini-3-flash",
        Message:       message,
        SystemPrompt:  systemPrompt,
        CallerService: "go-service",
    }
    
    body, _ := json.Marshal(req)
    resp, err := http.Post("http://ai-hub:8080/api/chat", "application/json", bytes.NewBuffer(body))
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var result ChatResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}
```

---

## Error Handling

Always check `success` field:

```typescript
const result = await analyzeWithAI(message);

if (!result.success) {
  if (result.error_code === 'RATE_LIMIT_EXHAUSTED') {
    // Wait and retry after retry_after_seconds
    await sleep(result.retry_after_seconds * 1000);
    return analyzeWithAI(message);
  }
  throw new Error(result.error);
}

return result.response;
```

---

## Docker Network

When running in Docker Compose, use service name:
- **Internal URL:** `http://ai-hub:8080`
- **External URL:** `http://localhost:8084`
















