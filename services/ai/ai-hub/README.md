# AI Hub Service

Multi-model AI gateway for internal microservices. Provides centralized access to AI models (Google Gemini, with support for additional providers in the future) with built-in rate limiting, retry handling, and request logging.

## Features

- **Multi-Model Support**: Configurable model registry supporting multiple AI providers
- **Rate Limiting**: RPM/TPM/RPD tracking per Google Cloud project (per Gemini documentation)
- **Automatic Retry**: Exponential backoff for 429, 500, 503 errors
- **Request Logging**: All requests logged to database with 7-day retention
- **Health Checks**: Kubernetes-compatible health endpoints

## Quick Start

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
AI_HUB_MODELS=api-stockandcryptotracker-google-gemini-3-flash
AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH=your_gemini_api_key

# Optional
GOOGLE_CLOUD_PROJECT_ID=your_project_id
AI_HUB_GEMINI_RPM_LIMIT=15
AI_HUB_GEMINI_TPM_LIMIT=1000000
AI_HUB_GEMINI_RPD_LIMIT=1500
AI_HUB_MAX_RETRIES=3
AI_HUB_TIMEOUT_SECONDS=30
```

### Running Locally

```bash
cd services/ai/ai-hub
pip install -r requirements.txt
python main.py
```

### Docker

```bash
docker build -t ai-hub .
docker run -p 8080:8080 --env-file .env ai-hub
```

## API Endpoints

### POST /api/chat

Send a message to an AI model.

**Request:**
```json
{
  "model_id": "api-stockandcryptotracker-google-gemini-3-flash",
  "message": "Analyze this candlestick pattern...",
  "system_prompt": "You are a trading analyst.",
  "caller_service": "twelvedata-worker"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "request_id": "uuid",
  "response": "Based on the pattern...",
  "model_id": "api-stockandcryptotracker-google-gemini-3-flash",
  "tokens_used": {
    "input": 45,
    "output": 120,
    "total": 165
  },
  "duration_ms": 850
}
```

**Error Response (429 Rate Limited):**
```json
{
  "success": false,
  "request_id": "uuid",
  "error": "Rate limit exceeded (RPM)",
  "error_code": "RATE_LIMIT_EXHAUSTED",
  "rate_limit_type": "RPM",
  "retry_after_seconds": 45
}
```

### GET /api/models

List all registered AI models.

### GET /health

Health check with database status.

### GET /api/stats?hours=24

Get usage statistics for the last N hours.

### GET /api/errors?limit=50

Get recent error logs.

## Model ID Format

```
<type>-<username>-<company>-<model>
```

Examples:
- `api-stockandcryptotracker-google-gemini-3-flash`
- `api-trading-google-gemini-2.5-pro`
- `cli-nixon-anthropic-claude-sonnet` (future)

## Rate Limiting

Per [Google Gemini documentation](https://ai.google.dev/gemini-api/docs/rate-limits):

| Limit | Description | Reset |
|-------|-------------|-------|
| RPM | Requests per minute | Rolling 60s window |
| TPM | Tokens per minute | Rolling 60s window |
| RPD | Requests per day | Midnight Pacific Time |

**Important**: Rate limits are per Google Cloud **project**, not per API key.

## Consuming from Other Services

### .NET
```csharp
var response = await httpClient.PostAsJsonAsync(
    "http://ai-hub:8080/api/chat",
    new {
        model_id = "api-stockandcryptotracker-google-gemini-3-flash",
        message = "Analyze this data...",
        system_prompt = "You are a trading analyst.",
        caller_service = "my-worker"
    }
);
```

### TypeScript/Next.js
```typescript
const res = await fetch('http://ai-hub:8080/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model_id: 'api-stockandcryptotracker-google-gemini-3-flash',
    message: 'Analyze this data...',
    system_prompt: 'You are a trading analyst.',
    caller_service: 'frontend'
  })
});
```

### Python
```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://ai-hub:8080/api/chat",
        json={
            "model_id": "api-stockandcryptotracker-google-gemini-3-flash",
            "message": "Analyze this data...",
            "system_prompt": "You are a trading analyst.",
            "caller_service": "python-service"
        }
    )
```

## Database Tables

The service uses two tables (created via EF Core migration):

- `ai_hub_logs`: Request/response logging with 7-day retention
- `ai_hub_rate_tracking`: Rate limit counters per minute/day



