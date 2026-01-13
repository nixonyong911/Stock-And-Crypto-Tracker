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
    "contactAdmin": "Something went wrong. Please contact admin.",
    "network": "Unable to connect. Check your internet connection.",
    "unauthorized": "You must be logged in to access this.",
    "forbidden": "You don't have permission to access this.",
    "notFound": "The requested resource was not found.",
    "serverError": "Server error. Please contact admin if this persists.",
    "timeout": "Request timed out. Please try again.",
    "validation": {
      "required": "{field} is required",
      "invalid": "{field} is invalid"
    },
    "database": {
      "connection": "Unable to connect to database.",
      "schema": "Data format has changed. Please refresh.",
      "constraint": "This operation violates data constraints."
    },
    "api": {
      "fetchFailed": "Failed to load data. Please try again.",
      "saveFailed": "Failed to save. Please try again.",
      "deleteFailed": "Failed to delete. Please try again."
    }
  },
  "empty": {
    "noData": "No data available.",
    "noStocks": "No stock data available yet.",
    "noCrypto": "No cryptocurrency data available yet.",
    "noResults": "No results found.",
    "hint": "Data will appear once the service updates."
  },
  "toast": {
    "success": "Operation completed successfully.",
    "error": "Something went wrong.",
    "loading": "Loading...",
    "saved": "Changes saved.",
    "deleted": "Item deleted."
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

## API Error Handling with i18n

### HTTP Status Code Mapping

```typescript
// lib/errors/http-errors.ts
export function getErrorMessageKey(status: number): string {
  const statusMap: Record<number, string> = {
    400: 'errors.validation.invalid',
    401: 'errors.unauthorized',
    403: 'errors.forbidden',
    404: 'errors.notFound',
    408: 'errors.timeout',
    500: 'errors.contactAdmin',      // Server error - contact admin
    502: 'errors.serverError',
    503: 'errors.serverError',
    504: 'errors.timeout',
  }
  return statusMap[status] || 'errors.generic'
}
```

### API Fetch Wrapper with i18n

```typescript
// lib/api/fetch-with-error.ts
'use client'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'  // or your toast library
import { logError } from '@/lib/logging/error-logger'
import { getErrorMessageKey } from '@/lib/errors/http-errors'

type FetchOptions = RequestInit & {
  showToast?: boolean
}

export async function fetchWithError<T>(
  url: string,
  options: FetchOptions = {}
): Promise<{ data: T | null; error: string | null }> {
  const { showToast = true, ...fetchOptions } = options

  try {
    const response = await fetch(url, options)

    if (!response.ok) {
      const errorKey = getErrorMessageKey(response.status)
      
      // Log server errors (500+)
      if (response.status >= 500) {
        await logError({
          error_type: 'api',
          error_code: `HTTP_${response.status}`,
          message: `API error: ${url}`,
          metadata: { status: response.status, url },
        })
      }

      return { data: null, error: errorKey }
    }

    const data = await response.json()
    return { data, error: null }
  } catch (e) {
    await logError({
      error_type: 'network',
      message: (e as Error).message,
      metadata: { url },
    })
    return { data: null, error: 'errors.network' }
  }
}
```

### Using in Components with Toast

```typescript
// hooks/use-api-fetch.ts
'use client'

import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { fetchWithError } from '@/lib/api/fetch-with-error'

export function useApiFetch() {
  const t = useTranslations()

  async function fetchData<T>(url: string): Promise<T | null> {
    const { data, error } = await fetchWithError<T>(url)

    if (error) {
      // Show localized toast notification
      toast.error(t(error))
      return null
    }

    return data
  }

  async function postData<T>(url: string, body: unknown): Promise<T | null> {
    const { data, error } = await fetchWithError<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (error) {
      toast.error(t(error))
      return null
    }

    toast.success(t('toast.saved'))
    return data
  }

  return { fetchData, postData }
}
```

## Toast Notifications

### Setup with Sonner

```typescript
// app/[locale]/layout.tsx
import { Toaster } from 'sonner'

export default function LocaleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors />
    </>
  )
}
```

### Toast Utility with i18n

```typescript
// lib/toast/show-toast.ts
'use client'

import { toast } from 'sonner'

// For use outside React components (e.g., in utility functions)
// Pass the translation function from the component
export function showErrorToast(t: (key: string) => string, errorKey: string) {
  toast.error(t(errorKey))
}

export function showSuccessToast(t: (key: string) => string, messageKey: string) {
  toast.success(t(messageKey))
}

// Pre-configured toasts for common scenarios
export const toastActions = {
  fetchError: (t: (key: string) => string) => toast.error(t('errors.api.fetchFailed')),
  saveError: (t: (key: string) => string) => toast.error(t('errors.api.saveFailed')),
  saveSuccess: (t: (key: string) => string) => toast.success(t('toast.saved')),
  serverError: (t: (key: string) => string) => toast.error(t('errors.contactAdmin')),
}
```

### Usage in Component

```typescript
// components/features/stocks/StockActions.tsx
'use client'

import { useTranslations } from 'next-intl'
import { useApiFetch } from '@/hooks/use-api-fetch'
import { toastActions } from '@/lib/toast/show-toast'

export function StockActions({ stockId }: { stockId: string }) {
  const t = useTranslations()
  const { postData } = useApiFetch()

  async function handleRefresh() {
    const result = await postData(`/api/stocks/${stockId}/refresh`, {})
    // Toast is handled automatically by useApiFetch
  }

  return (
    <button onClick={handleRefresh}>Refresh</button>
  )
}
```

## Empty State Handling

### Empty State Component

```typescript
// components/ui/empty-state.tsx
'use client'

import { useTranslations } from 'next-intl'

type EmptyStateProps = {
  messageKey?: string       // i18n key for main message
  hintKey?: string          // i18n key for hint
  icon?: React.ReactNode
}

export function EmptyState({
  messageKey = 'empty.noData',
  hintKey = 'empty.hint',
  icon,
}: EmptyStateProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      {icon && <div className="mb-4 text-4xl">{icon}</div>}
      <p className="text-lg font-medium">{t(messageKey)}</p>
      {hintKey && <p className="text-sm mt-2">{t(hintKey)}</p>}
    </div>
  )
}
```

### Data Component with Error/Empty States

```typescript
// components/features/stocks/StockList.tsx
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDisplay } from '@/components/ui/error-display'
import { getStocks } from '@/lib/supabase/stocks'

export async function StockList() {
  const t = useTranslations()
  const result = await getStocks()

  // Error state - API failed
  if (!result.success) {
    return (
      <ErrorDisplay 
        messageKey="errors.api.fetchFailed"
        onRetry={() => window.location.reload()}
      />
    )
  }

  // Empty state - No data
  if (result.data.length === 0) {
    return (
      <EmptyState
        messageKey="empty.noStocks"
        hintKey="empty.hint"
        icon="📊"
      />
    )
  }

  // Success - render data
  return (
    <div>
      {result.data.map(stock => (
        <StockCard key={stock.stock_id} stock={stock} />
      ))}
    </div>
  )
}
```

### Error Display Component

```typescript
// components/ui/error-display.tsx
'use client'

import { useTranslations } from 'next-intl'

type ErrorDisplayProps = {
  messageKey?: string
  onRetry?: () => void
}

export function ErrorDisplay({
  messageKey = 'errors.generic',
  onRetry,
}: ErrorDisplayProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center justify-center py-12 text-destructive">
      <p className="text-lg font-medium">{t(messageKey)}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded"
        >
          {t('common.tryAgain') || 'Try again'}
        </button>
      )}
    </div>
  )
}
```

## TanStack Query with i18n Error Handling

```typescript
// hooks/use-stocks-query.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { getErrorMessageKey } from '@/lib/errors/http-errors'

export function useStocksQuery() {
  const t = useTranslations()

  return useQuery({
    queryKey: ['stocks'],
    queryFn: async () => {
      const res = await fetch('/api/stocks')
      if (!res.ok) {
        const errorKey = getErrorMessageKey(res.status)
        throw new Error(errorKey)
      }
      return res.json()
    },
    meta: {
      // Called on error
      onError: (error: Error) => {
        toast.error(t(error.message))
      },
    },
  })
}

// Usage in component
function StockListClient() {
  const t = useTranslations()
  const { data, isLoading, isError, error } = useStocksQuery()

  if (isLoading) return <LoadingSpinner />
  
  if (isError) {
    return <ErrorDisplay messageKey={error.message} />
  }

  if (!data || data.length === 0) {
    return <EmptyState messageKey="empty.noStocks" />
  }

  return <StockGrid stocks={data} />
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