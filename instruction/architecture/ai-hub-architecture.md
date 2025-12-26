# AI Hub Architecture

## Overview

Centralized Python FastAPI service providing AI capabilities to all microservices. Acts as gateway to AI providers (Google Gemini) with built-in rate limiting, retry handling, and request logging.

**Key Benefits:**
- Single point of configuration for AI API keys
- Centralized rate limit management (per Google project)
- Automatic retry with exponential backoff for transient errors
- Full request/response logging for debugging and auditing
- Language-agnostic HTTP API consumable by any service

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Consumer Services                                │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│  .NET Workers   │  Next.js Frontend│  Go Services    │  Python Services  │
└────────┬────────┴────────┬─────────┴────────┬────────┴─────────┬─────────┘
         │            HTTP POST /api/chat     │                  │
         └─────────────────┴──────────────────┴──────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI Hub Service (Python FastAPI)                       │
│                    Port: 8084 (Docker) / 8080 (internal)                │
├─────────────────────────────────────────────────────────────────────────┤
│  /api/chat → Rate Limiter → Retry Handler → Model Registry → Gemini    │
│       │         (RPM/TPM/RPD)   (429/500/503)                           │
│       └─────────────────────────────────────────────────────────────────│
│                              │                              │           │
│                              ▼                              ▼           │
│                     Google Gemini API              Supabase PostgreSQL  │
│                                                    (ai_hub_logs,        │
│                                                     ai_hub_rate_tracking)│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
services/ai/ai-hub/
├── main.py                     # FastAPI app, endpoints, lifecycle
├── config.py                   # Model registry, API keys, rate limits
├── schemas.py                  # Pydantic request/response models
├── models/
│   ├── base.py                 # Abstract base: APIModelClient, CLIModelClient
│   ├── registry.py             # Model routing and client caching
│   └── google/gemini.py        # Google Gemini client implementation
├── services/
│   ├── rate_limiter.py         # RPM/TPM/RPD tracking per Google project
│   ├── retry_handler.py        # Exponential backoff for 429/500/503
│   └── logger.py               # Database logging with 500-char truncation
├── db/connection.py            # Async PostgreSQL connection pool
├── Dockerfile
└── requirements.txt
```

---

## Model ID Naming Convention

**Format:** `<type>-<username>-<company>-<model>`

| Field | Description | Examples |
|-------|-------------|----------|
| type | `api` or `cli` | api, cli |
| username | Account/service identifier | stockandcryptotracker, trading |
| company | AI provider | google, anthropic, openai |
| model | Model name | gemini-3-flash, claude-sonnet |

**Examples:**
- `api-stockandcryptotracker-google-gemini-3-flash` (current default)
- `cli-nixon-anthropic-claude-sonnet` (future CLI-based)

---

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
AI_HUB_MODELS=api-stockandcryptotracker-google-gemini-3-flash
AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH=your_gemini_api_key

# Optional (with defaults)
GOOGLE_CLOUD_PROJECT_ID=default-project
AI_HUB_GEMINI_RPM_LIMIT=15          # Requests per minute (Free tier)
AI_HUB_GEMINI_TPM_LIMIT=1000000     # Tokens per minute
AI_HUB_GEMINI_RPD_LIMIT=1500        # Requests per day
AI_HUB_MAX_RETRIES=3
AI_HUB_TIMEOUT_SECONDS=30
```

### API Key Environment Variable Pattern

Model ID → Environment variable:
- Replace `-` with `_`
- Uppercase everything
- Prefix with `AI_KEY_`

Example: `api-stockandcryptotracker-google-gemini-3-flash` → `AI_KEY_API_STOCKANDCRYPTOTRACKER_GOOGLE_GEMINI_3_FLASH`

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Main AI interaction endpoint |
| `/api/models` | GET | List registered models |
| `/api/stats?hours=24` | GET | Usage statistics |
| `/api/errors?limit=50` | GET | Recent error logs |
| `/health` | GET | Health check with DB status |
| `/health/live` | GET | Kubernetes liveness probe |
| `/health/ready` | GET | Kubernetes readiness probe |

### POST /api/chat

**Request:**
```json
{
  "model_id": "api-stockandcryptotracker-google-gemini-3-flash",
  "message": "Analyze this candlestick pattern...",
  "system_prompt": "You are a technical trading analyst.",
  "caller_service": "twelvedata-worker"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "request_id": "uuid",
  "response": "The candlestick shows a bullish hammer pattern...",
  "tokens_used": { "input": 45, "output": 120, "total": 165 },
  "duration_ms": 850
}
```

**Rate Limited (429):**
```json
{
  "success": false,
  "error": "Rate limit exceeded (RPM)",
  "error_code": "RATE_LIMIT_EXHAUSTED",
  "rate_limit_type": "RPM",
  "retry_after_seconds": 45
}
```

---

## Rate Limiting

Based on [Google Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits).

| Limit | Description | Reset | Free Tier |
|-------|-------------|-------|-----------|
| **RPM** | Requests per minute | Rolling 60s | 15 |
| **TPM** | Tokens per minute | Rolling 60s | 1,000,000 |
| **RPD** | Requests per day | **Midnight Pacific** | 1,500 |

**Critical:** Rate limits are per Google Cloud **PROJECT**, not per API key.

### Upgrading Limits

| Tier | Qualification |
|------|---------------|
| Tier 1 | Link paid billing account |
| Tier 2 | >$250 total spend + 30 days |
| Tier 3 | >$1,000 total spend + 30 days |

---

## Error Handling

### Automatic Retry Strategy

| HTTP Status | Type | Strategy | Max Retries |
|-------------|------|----------|-------------|
| 429 | Rate Limit | Backoff: 1s, 2s, 4s, 8s | 3 |
| 500 | Server Error | Backoff: 0.5s, 1s | 2 |
| 503 | Unavailable | Backoff: 1s, 2s | 2 |
| Timeout | Timeout | Single retry | 1 |
| 400/401/403 | Client Error | No retry | 0 |

### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `MODEL_NOT_FOUND` | Model ID not in registry | Check model_id spelling |
| `API_KEY_MISSING` | No API key configured | Add env variable |
| `RATE_LIMIT_PRE_CHECK` | Would exceed limit | Wait and retry |
| `RATE_LIMIT_EXHAUSTED` | Hit limit after retries | Wait longer |
| `PROVIDER_ERROR` | AI provider error | Check Gemini status |

---

## Adding New AI Models

### 1. Add Environment Variables

```bash
AI_HUB_MODELS=api-stockandcryptotracker-google-gemini-3-flash,api-trading-google-gemini-2.5-pro
AI_KEY_API_TRADING_GOOGLE_GEMINI_2_5_PRO=your_new_key
```

### 2. (For new providers) Create Client Class

```python
# models/openai/chatgpt.py
from models.base import APIModelClient, ModelResponse

class ChatGPTClient(APIModelClient):
    async def generate(self, message: str, system_prompt: str = None) -> ModelResponse:
        # Implementation
        pass
```

### 3. Register in Model Registry

```python
# models/registry.py
def _create_client(self, config: ModelConfig):
    if config.company == "google":
        return GeminiClient(...)
    elif config.company == "openai":
        return ChatGPTClient(...)  # Add new provider
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Model not found" | Check `AI_HUB_MODELS` includes model ID, verify format |
| "API key not configured" | Add `AI_KEY_<NORMALIZED_MODEL_ID>` env var |
| Rate limit errors | Check `/api/stats`, consider upgrading tier |
| Database connection errors | Verify `DATABASE_URL`, check Supabase pooler |

---

## Future Improvements

- [ ] OpenAI ChatGPT support
- [ ] Anthropic Claude CLI support
- [ ] Request queuing for rate limits
- [ ] Response caching
- [ ] WebSocket streaming


