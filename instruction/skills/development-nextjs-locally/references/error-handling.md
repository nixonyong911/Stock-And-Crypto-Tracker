# Error Handling

## Overview

Error handling uses a layered approach:
1. **Centralized i18n** - All error messages in language files
2. **Multi-destination logging** - Console, Supabase, Grafana
3. **Error Boundaries** - Graceful UI recovery
4. **Result Pattern** - Explicit error handling in data functions

## Internationalization (next-intl)

### Setup Structure

```
lib/
└── i18n/
    ├── config.ts           # next-intl configuration
    ├── request.ts          # Server-side locale detection
    └── messages/
        ├── en.json         # English messages
        └── zh.json         # Chinese messages
```

### Configuration

```typescript
// lib/i18n/config.ts
export const locales = ['en', 'zh'] as const
export const defaultLocale = 'en' as const

export type Locale = (typeof locales)[number]
```

### Message Structure

```json
// lib/i18n/messages/en.json
{
  "errors": {
    "generic": "Something went wrong. Please try again.",
    "network": "Unable to connect. Check your internet connection.",
    "unauthorized": "You must be logged in to access this.",
    "forbidden": "You don't have permission to access this.",
    "notFound": "The requested resource was not found.",
    "validation": {
      "required": "{field} is required",
      "invalid": "{field} is invalid"
    },
    "database": {
      "connection": "Unable to connect to database.",
      "schema": "Data format has changed. Please refresh.",
      "constraint": "This operation violates data constraints."
    }
  }
}
```

### URL-Based Locales

Routes follow pattern: `/{locale}/page`

```
app/
└── [locale]/
    ├── layout.tsx          # Locale provider
    ├── page.tsx            # Homepage
    └── dashboard/
        └── page.tsx
```

## Error Logging

### Multi-Destination Strategy

| Destination | Purpose | When |
|-------------|---------|------|
| Console | Development debugging | Always in dev |
| Supabase `frontend_error_logs` | Queryable error history | Production errors |
| Grafana | Monitoring dashboards | All environments |

### Error Log Schema

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

### Logging Utility

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

## Error Boundaries

### Route-Level Error Boundary

```typescript
// app/[locale]/error.tsx
'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { logError } from '@/lib/logging/error-logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    logError({
      error_type: 'uncaught',
      message: error.message,
      stack_trace: error.stack,
      metadata: { digest: error.digest },
    })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold mb-4">{t('generic')}</h2>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded"
      >
        Try again
      </button>
    </div>
  )
}
```

### Global Error Boundary

```typescript
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  )
}
```

## Result Pattern for Data Functions

### Type Definition

```typescript
// types/result.ts
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>
```

### Usage in Repository Functions

```typescript
// lib/supabase/stocks.ts
import { Result } from '@/types/result'
import { StockPrice, stockPriceSchema } from '@/types'

export async function getStocks(): Promise<Result<StockPrice[]>> {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('latest_stock_prices')
      .select('*')

    if (error) {
      return { success: false, error: new Error(error.message) }
    }

    const validated = stockPriceSchema.array().safeParse(data)
    if (!validated.success) {
      return { success: false, error: new Error('Schema validation failed') }
    }

    return { success: true, data: validated.data }
  } catch (e) {
    return { success: false, error: e as Error }
  }
}
```

### Usage in Components

```typescript
// components/features/stocks/StockList.tsx
export async function StockList() {
  const result = await getStocks()

  if (!result.success) {
    return <ErrorDisplay message={result.error.message} />
  }

  return (
    <div>
      {result.data.map(stock => (
        <StockCard key={stock.stock_id} stock={stock} />
      ))}
    </div>
  )
}
```

## Error Types Reference

| Type | Cause | User Message Key |
|------|-------|------------------|
| `validation` | Zod schema failure | `errors.validation.*` |
| `database` | Supabase error | `errors.database.*` |
| `network` | Fetch failure | `errors.network` |
| `unauthorized` | Missing auth | `errors.unauthorized` |
| `forbidden` | Insufficient permissions | `errors.forbidden` |
| `ai_query` | AI-generated query error | `errors.database.schema` |
