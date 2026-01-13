# Error Logging

## Multi-Destination Strategy

| Destination | Purpose | When |
|-------------|---------|------|
| Console | Development debugging | Always in dev |
| Supabase `frontend_error_logs` | Queryable error history | Production errors |
| Grafana | Monitoring dashboards | All environments |

## Error Log Schema

```sql
-- Supabase table: frontend_error_logs
CREATE TABLE frontend_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL,        -- 'validation', 'database', 'network', etc.
  error_code TEXT,                 -- Application-specific code
  message TEXT NOT NULL,
  stack_trace TEXT,
  user_id UUID REFERENCES auth.users(id),
  url TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Logging Utility

```typescript
// lib/logging/error-logger.ts
import { createServerSupabaseClient } from '@/lib/supabase/server'

type ErrorLogEntry = {
  error_type: string
  error_code?: string
  message: string
  stack_trace?: string
  url?: string
  metadata?: Record<string, unknown>
}

export async function logError(entry: ErrorLogEntry) {
  // Console (development)
  if (process.env.NODE_ENV === 'development') {
    console.error('[ERROR]', entry)
  }

  // Supabase (production)
  try {
    const supabase = createServerSupabaseClient()
    await supabase.from('frontend_error_logs').insert({
      ...entry,
      user_agent: typeof window !== 'undefined' ? navigator.userAgent : null,
    })
  } catch (e) {
    console.error('Failed to log error to Supabase:', e)
  }
}
```

## Error Types Reference

| Type | Cause | User Message Key |
|------|-------|------------------|
| `validation` | Zod schema failure | `errors.validation.*` |
| `database` | Supabase error | `errors.database.*` |
| `network` | Fetch failure | `errors.network` |
| `unauthorized` | Missing auth (401) | `errors.unauthorized` |
| `forbidden` | Insufficient permissions (403) | `errors.forbidden` |
| `notFound` | Resource not found (404) | `errors.notFound` |
| `serverError` | Server error (500+) | `errors.contactAdmin` |
| `timeout` | Request timeout (408/504) | `errors.timeout` |
| `ai_query` | AI-generated query error | `errors.database.schema` |

## Error Flow Summary

```
API Request
    │
    ├── Success (200) ──────────────────────────────────────→ Render Data
    │
    ├── Error (4xx) ────→ getErrorMessageKey() ──→ t(key) ──→ Toast + Error UI
    │
    └── Error (5xx) ────→ logError() ──→ t('errors.contactAdmin') ──→ Toast + Error UI
                              │
                              └──→ Supabase + Grafana (for debugging)
```

## Error Recovery Patterns

### Exponential Backoff

```typescript
// lib/utils/retry.ts
type RetryOptions = {
  maxAttempts?: number
  baseDelay?: number
  maxDelay?: number
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 10000 } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxAttempts) throw error

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Retry failed')
}

// Usage
const data = await withRetry(() => fetch('/api/stocks').then(r => r.json()))
```

### TanStack Query Retry

```typescript
// Built-in retry with exponential backoff
useQuery({
  queryKey: ['stocks'],
  queryFn: fetchStocks,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
})
```
