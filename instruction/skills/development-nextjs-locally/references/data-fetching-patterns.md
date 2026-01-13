# Data Fetching Patterns

## Server-Side with URL Params

```typescript
// app/[locale]/stocks/page.tsx
type SearchParams = { page?: string; search?: string; sort?: string }

export default async function StocksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const search = params.search || ''
  const sort = params.sort || 'symbol'

  const result = await getStocks({ page, search, sort, limit: 20 })

  if (!result.success) return <ErrorDisplay />

  return (
    <>
      <SearchBar defaultValue={search} />
      <StockGrid stocks={result.data.items} />
      <Pagination total={result.data.total} page={page} />
    </>
  )
}
```

## Repository with Pagination

```typescript
// lib/supabase/stocks.ts
type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  totalPages: number
}

type StockQuery = {
  page?: number
  limit?: number
  search?: string
  sort?: 'symbol' | 'price' | 'change'
}

export async function getStocks(query: StockQuery): Promise<Result<PaginatedResult<Stock>>> {
  const { page = 1, limit = 20, search = '', sort = 'symbol' } = query
  const offset = (page - 1) * limit

  const supabase = createServerSupabaseClient()

  let builder = supabase.from('latest_stock_prices').select('*', { count: 'exact' })

  if (search) {
    builder = builder.ilike('symbol', `%${search}%`)
  }

  builder = builder.order(sort).range(offset, offset + limit - 1)

  const { data, error, count } = await builder

  if (error) return { success: false, error: new Error(error.message) }

  return {
    success: true,
    data: {
      items: data,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    },
  }
}
```

## Client-Side Search

```typescript
// components/features/stocks/SearchBar.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useDebouncedCallback } from 'use-debounce'

export function SearchBar({ defaultValue = '' }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams)
    if (term) {
      params.set('search', term)
      params.set('page', '1')
    } else {
      params.delete('search')
    }
    router.push(`?${params.toString()}`)
  }, 300)

  return (
    <input
      type="search"
      defaultValue={defaultValue}
      onChange={(e) => handleSearch(e.target.value)}
      placeholder="Search..."
    />
  )
}
```

## Pagination Component

```typescript
// components/ui/pagination.tsx
'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type PaginationProps = { total: number; page: number; limit?: number }

export function Pagination({ total, page, limit = 20 }: PaginationProps) {
  const searchParams = useSearchParams()
  const totalPages = Math.ceil(total / limit)

  const createPageUrl = (p: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(p))
    return `?${params.toString()}`
  }

  return (
    <div className="flex gap-2">
      {page > 1 && <Link href={createPageUrl(page - 1)}>Previous</Link>}
      <span>{page} / {totalPages}</span>
      {page < totalPages && <Link href={createPageUrl(page + 1)}>Next</Link>}
    </div>
  )
}
```

## TanStack Query (Client)

```typescript
// hooks/use-stocks-query.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'

export function useStocksQuery() {
  const searchParams = useSearchParams()
  const page = searchParams.get('page') || '1'
  const search = searchParams.get('search') || ''

  return useQuery({
    queryKey: ['stocks', { page, search }],
    queryFn: () => fetch(`/api/stocks?page=${page}&search=${search}`).then(r => r.json()),
  })
}
```

## Pattern Summary

| Pattern | Use When |
|---------|----------|
| Server + URL params | SEO, shareable URLs |
| TanStack Query | Real-time updates, optimistic UI |
| Debounced search | Reduce API calls on typing |
