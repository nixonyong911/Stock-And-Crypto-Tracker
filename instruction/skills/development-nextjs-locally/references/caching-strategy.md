# Caching Strategy

## Overview

Two-layer caching approach:
1. **Redis** - Server-side shared cache
2. **TanStack Query** - Client-side cache with smart invalidation

## Redis Configuration

### Namespace Convention

**CRITICAL:** Redis server is shared with other services. MUST use `frontend:` prefix.

| Service | Prefix | Example |
|---------|--------|---------|
| Frontend | `frontend:` | `frontend:prices:stocks` |
| Telegram Bot | `telegram:` | `telegram:sessions:123` |
| MCP Analysis | `mcp:` | `mcp:query:cache` |

### Redis Client Setup

```typescript
// lib/redis/client.ts
import { createClient } from 'redis'

const NAMESPACE = 'frontend'

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
})

redis.on('error', (err) => console.error('Redis Client Error', err))

// Namespace-aware helpers
export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redis.get(`${NAMESPACE}:${key}`)
  return data ? JSON.parse(data) : null
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  await redis.setEx(`${NAMESPACE}:${key}`, ttlSeconds, JSON.stringify(value))
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(`${NAMESPACE}:${key}`)
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(`${NAMESPACE}:${pattern}`)
  if (keys.length > 0) {
    await redis.del(keys)
  }
}
```

### Cache Key Patterns

```typescript
// lib/redis/keys.ts
export const cacheKeys = {
  // Price data
  stockPrices: () => 'prices:stocks',
  cryptoPrices: () => 'prices:crypto',
  stockPrice: (symbol: string) => `prices:stock:${symbol}`,
  
  // User data
  userSession: (userId: string) => `user:${userId}:session`,
  userSubscription: (userId: string) => `user:${userId}:subscription`,
  
  // Computed data
  analytics: (type: string) => `analytics:${type}`,
} as const
```

### TTL Guidelines

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Stock/Crypto prices | 5 minutes | Updates frequently |
| User subscription status | 1 hour | Rarely changes |
| Static content | 24 hours | Stable data |
| Session data | 30 minutes | Security |

## TanStack Query Configuration

### Provider Setup

```typescript
// app/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

### Query Hooks

```typescript
// hooks/use-stocks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useStocks() {
  return useQuery({
    queryKey: ['stocks'],
    queryFn: async () => {
      const res = await fetch('/api/stocks')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useStockMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: StockUpdate) => {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      return res.json()
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
    },
  })
}
```

### Query Key Convention

```typescript
// lib/query-keys.ts
export const queryKeys = {
  all: ['stocks'] as const,
  lists: () => [...queryKeys.all, 'list'] as const,
  list: (filters: StockFilters) => [...queryKeys.lists(), filters] as const,
  details: () => [...queryKeys.all, 'detail'] as const,
  detail: (id: string) => [...queryKeys.details(), id] as const,
}

// Usage
useQuery({
  queryKey: queryKeys.detail('AAPL'),
  queryFn: () => getStock('AAPL'),
})
```

## Cache Invalidation Patterns

### After Mutations

```typescript
// Invalidate specific query
queryClient.invalidateQueries({ queryKey: ['stocks', 'AAPL'] })

// Invalidate all stock queries
queryClient.invalidateQueries({ queryKey: ['stocks'] })

// Remove from cache entirely
queryClient.removeQueries({ queryKey: ['stocks', 'OLD_STOCK'] })
```

### Server Action Integration

```typescript
// app/actions/subscription.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { deleteCache } from '@/lib/redis/client'
import { cacheKeys } from '@/lib/redis/keys'

export async function updateSubscription(userId: string, plan: string) {
  // Update database...

  // Invalidate Redis cache
  await deleteCache(cacheKeys.userSubscription(userId))

  // Invalidate Next.js cache
  revalidatePath('/dashboard')
  revalidateTag('subscription')

  return { success: true }
}
```

## Hybrid Caching Flow

```
Request → TanStack Query Cache → Redis Cache → Supabase
            (client-side)        (server-side)   (database)
```

### Implementation Example

```typescript
// lib/supabase/stocks.ts
import { getCache, setCache } from '@/lib/redis/client'
import { cacheKeys } from '@/lib/redis/keys'

export async function getStocksWithCache(): Promise<StockPrice[]> {
  // 1. Check Redis cache
  const cached = await getCache<StockPrice[]>(cacheKeys.stockPrices())
  if (cached) return cached

  // 2. Fetch from database
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('latest_stock_prices')
    .select('*')

  if (error) throw error

  // 3. Store in Redis
  await setCache(cacheKeys.stockPrices(), data, 300) // 5 min TTL

  return data
}
```

## Monitoring Cache Performance

Track cache hit rates via metrics:

```typescript
// lib/redis/client.ts
export async function getCacheWithMetrics<T>(key: string): Promise<T | null> {
  const start = Date.now()
  const data = await redis.get(`${NAMESPACE}:${key}`)
  const duration = Date.now() - start

  // Log metrics (Grafana integration)
  console.log({
    metric: 'cache_lookup',
    key,
    hit: !!data,
    duration_ms: duration,
  })

  return data ? JSON.parse(data) : null
}
```
