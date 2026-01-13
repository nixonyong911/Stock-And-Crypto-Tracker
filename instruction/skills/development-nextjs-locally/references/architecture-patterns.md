# Architecture Patterns

## Component Pattern: Hybrid

### Shared UI Components (`components/ui/`)

- shadcn/ui components live here
- Reusable across all features
- No business logic, pure presentation
- Example: `Button`, `Card`, `Dialog`, `Input`

### Feature-Specific Components (`components/features/`)

- Colocated with their feature
- May contain business logic
- Can import from `components/ui/`
- Example: `StockList`, `CryptoCard`, `SubscriptionForm`

```
components/
├── ui/                    # shadcn/ui + custom primitives
│   ├── button.tsx
│   ├── card.tsx
│   └── dialog.tsx
└── features/              # Feature-specific
    ├── stocks/
    │   ├── StockList.tsx
    │   └── StockCard.tsx
    └── auth/
        ├── LoginForm.tsx
        └── UserMenu.tsx
```

## State Management

### React Context - Auth & Theme

Use Context for global, infrequently-changing state:

```typescript
// lib/context/auth-context.tsx
'use client'
import { createContext, useContext } from 'react'
import { User } from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

### TanStack Query - Server State

Use for all server data fetching:

```typescript
// hooks/use-stocks.ts
import { useQuery } from '@tanstack/react-query'
import { getStocks } from '@/lib/supabase/stocks'

export function useStocks() {
  return useQuery({
    queryKey: ['stocks'],
    queryFn: getStocks,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
```

**Benefits:**
- Automatic caching and deduplication
- Background refetching
- Optimistic updates for mutations
- Error and loading states built-in

## Data Layer

### Repository Functions (Reads)

All data fetching in `lib/supabase/`:

```typescript
// lib/supabase/stocks.ts
import { createServerSupabaseClient } from './server'
import { StockPrice, stockPriceSchema } from '@/types'

export async function getStocks(): Promise<StockPrice[]> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('latest_stock_prices')
    .select('*')
    .order('symbol')
  
  if (error) throw error
  return stockPriceSchema.array().parse(data)
}
```

### Server Actions (Writes)

All mutations via Server Actions:

```typescript
// app/actions/subscription.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { subscriptionSchema } from '@/types'

export async function subscribe(formData: FormData) {
  const supabase = createServerSupabaseClient()
  const data = subscriptionSchema.parse(Object.fromEntries(formData))
  
  const { error } = await supabase
    .from('subscriptions')
    .insert(data)
  
  if (error) return { error: error.message }
  
  revalidatePath('/dashboard')
  return { success: true }
}
```

## Type Safety

### Supabase Generated Types (Base)

Generate from database schema:

```bash
npx supabase gen types typescript --project-id <id> > src/types/supabase.ts
```

### Zod Schemas (Runtime Validation)

Validate at API boundaries:

```typescript
// types/schemas.ts
import { z } from 'zod'

export const stockPriceSchema = z.object({
  stock_id: z.number(),
  symbol: z.string(),
  stock_name: z.string().nullable(),
  open_price: z.number().nullable(),
  high_price: z.number().nullable(),
  low_price: z.number().nullable(),
  close_price: z.number().nullable(),
  volume: z.number().nullable(),
  price_date: z.coerce.date(),
})

export type StockPrice = z.infer<typeof stockPriceSchema>
```

### Type Export Pattern

```typescript
// types/index.ts
export * from './schemas'
export type { Database } from './supabase'

// Re-export commonly used types
export type Tables<T extends keyof Database['public']['Tables']> = 
  Database['public']['Tables'][T]['Row']
```

## Styling

### shadcn/ui + Tailwind

1. **Base Components**: Use shadcn/ui for accessible primitives
2. **Customization**: Modify via CSS variables in `globals.css`
3. **Feature Styles**: Tailwind utilities for feature-specific styling

```css
/* globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    /* ... */
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... */
  }
}
```

## Backend Pattern Translations

| Backend Pattern | Next.js Equivalent |
|-----------------|-------------------|
| Repository Pattern | `lib/` folder with data access functions |
| Layered Architecture | `components/` (UI) + `lib/` (data) + `types/` (contracts) |
| Factory Pattern | Component composition + custom hooks |
| SOLID - Single Responsibility | One component = one purpose |
| SOLID - Dependency Inversion | Props/Context for dependencies |
| TDD | Playwright for E2E, Vitest for unit |

## Complete Feature Example: Stock List

```
# Files involved:
types/schemas.ts           # Zod schema
lib/supabase/stocks.ts     # Repository
app/[locale]/stocks/page.tsx    # Page
components/features/stocks/     # Components
```

```typescript
// types/schemas.ts
export const stockPriceSchema = z.object({
  stock_id: z.number(),
  symbol: z.string(),
  close_price: z.number().nullable(),
})
export type StockPrice = z.infer<typeof stockPriceSchema>

// lib/supabase/stocks.ts
export async function getStocks(): Promise<Result<StockPrice[]>> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.from('latest_stock_prices').select('*')
  if (error) return { success: false, error: new Error(error.message) }
  return { success: true, data: stockPriceSchema.array().parse(data) }
}

// app/[locale]/stocks/page.tsx
export default async function StocksPage() {
  return (
    <Suspense fallback={<StockListSkeleton />}>
      <StockList />
    </Suspense>
  )
}

// components/features/stocks/StockList.tsx
export async function StockList() {
  const result = await getStocks()
  if (!result.success) return <ErrorDisplay messageKey="errors.api.fetchFailed" />
  if (!result.data.length) return <EmptyState messageKey="empty.noStocks" />
  return <StockGrid stocks={result.data} />
}
```
