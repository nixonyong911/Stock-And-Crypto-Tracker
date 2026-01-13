# Error Handling

## Overview

Error handling uses a layered approach:
1. **Centralized i18n** - All error messages in language files
2. **Multi-destination logging** - Console, Supabase, Grafana
3. **Error Boundaries** - Graceful UI recovery
4. **Result Pattern** - Explicit error handling in data functions

**Related:**
- [i18n-error-messages.md](i18n-error-messages.md) - Internationalization setup, message structure
- [error-logging.md](error-logging.md) - Multi-destination logging, recovery patterns

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

## Empty State Handling

### Empty State Component

```typescript
// components/ui/empty-state.tsx
'use client'

import { useTranslations } from 'next-intl'

type EmptyStateProps = {
  messageKey?: string
  hintKey?: string
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

## ErrorDisplay Component

```typescript
// components/ui/error-display.tsx
'use client'

import { useTranslations } from 'next-intl'

type ErrorMessageKey =
  | 'errors.generic'
  | 'errors.contactAdmin'
  | 'errors.network'
  | 'errors.unauthorized'
  | 'errors.forbidden'
  | 'errors.notFound'
  | 'errors.serverError'
  | 'errors.timeout'
  | 'errors.api.fetchFailed'
  | 'errors.api.saveFailed'
  | 'errors.api.deleteFailed'
  | 'errors.database.connection'
  | 'errors.database.schema'

type ErrorDisplayProps = {
  messageKey?: ErrorMessageKey
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
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  )
}
```
