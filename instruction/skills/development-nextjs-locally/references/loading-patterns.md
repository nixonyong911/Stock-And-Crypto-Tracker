# Loading Patterns

## Route-Level Loading (Suspense)

```typescript
// app/[locale]/dashboard/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
```

## Component-Level Suspense

```typescript
// app/[locale]/dashboard/page.tsx
import { Suspense } from 'react'
import { StockList } from '@/components/features/stocks/StockList'
import { StockListSkeleton } from '@/components/features/stocks/StockListSkeleton'

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<StockListSkeleton />}>
        <StockList />
      </Suspense>
    </div>
  )
}
```

## Skeleton Components

```typescript
// components/features/stocks/StockListSkeleton.tsx
import { Skeleton } from '@/components/ui/skeleton'

export function StockListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 border rounded">
          <Skeleton className="h-6 w-20 mb-2" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  )
}
```

## Client Component Loading

```typescript
// components/features/stocks/StockListClient.tsx
'use client'

import { useStocksQuery } from '@/hooks/use-stocks-query'
import { StockListSkeleton } from './StockListSkeleton'

export function StockListClient() {
  const { data, isLoading, isError } = useStocksQuery()

  if (isLoading) return <StockListSkeleton />
  if (isError) return <ErrorDisplay />
  if (!data?.length) return <EmptyState />

  return <StockGrid stocks={data} />
}
```

## Loading Button

```typescript
// components/ui/loading-button.tsx
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

type LoadingButtonProps = React.ComponentProps<typeof Button> & {
  loading?: boolean
}

export function LoadingButton({ loading, children, ...props }: LoadingButtonProps) {
  return (
    <Button disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}
```

## Pattern Summary

| Pattern | Use When |
|---------|----------|
| `loading.tsx` | Route transitions |
| `<Suspense>` | Async Server Components |
| Skeleton | Predictable layout shift |
| `isLoading` state | Client-side data fetching |
