# i18n Error Messages

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
  },
  "common": {
    "tryAgain": "Try again",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "loading": "Loading...",
    "refresh": "Refresh"
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
    500: 'errors.contactAdmin',
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
    const response = await fetch(url, fetchOptions)

    if (!response.ok) {
      const errorKey = getErrorMessageKey(response.status)
      
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

export function showErrorToast(t: (key: string) => string, errorKey: string) {
  toast.error(t(errorKey))
}

export function showSuccessToast(t: (key: string) => string, messageKey: string) {
  toast.success(t(messageKey))
}

export const toastActions = {
  fetchError: (t: (key: string) => string) => toast.error(t('errors.api.fetchFailed')),
  saveError: (t: (key: string) => string) => toast.error(t('errors.api.saveFailed')),
  saveSuccess: (t: (key: string) => string) => toast.success(t('toast.saved')),
  serverError: (t: (key: string) => string) => toast.error(t('errors.contactAdmin')),
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
