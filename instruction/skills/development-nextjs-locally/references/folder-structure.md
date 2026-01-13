# Folder Structure

## SEO-Optimized Structure

```
src/
├── app/
│   ├── (public)/                    # Public pages (SEO-indexed)
│   │   ├── page.tsx                 # Homepage /
│   │   ├── layout.tsx               # Public layout with SEO meta
│   │   ├── stocks/
│   │   │   └── page.tsx             # /stocks
│   │   ├── crypto/
│   │   │   └── page.tsx             # /crypto
│   │   └── [locale]/                # i18n routes
│   │       ├── page.tsx             # /en, /zh
│   │       └── about/
│   │           └── page.tsx         # /en/about
│   │
│   ├── (auth)/                      # Auth-required pages
│   │   ├── layout.tsx               # Auth check middleware
│   │   ├── dashboard/
│   │   │   └── page.tsx             # /dashboard
│   │   ├── profile/
│   │   │   └── page.tsx             # /profile
│   │   └── subscription/
│   │       └── page.tsx             # /subscription
│   │
│   ├── (admin)/                     # Admin-only pages
│   │   ├── layout.tsx               # Admin role check
│   │   └── admin/
│   │       ├── page.tsx             # /admin
│   │       └── users/
│   │           └── page.tsx         # /admin/users
│   │
│   ├── api/                         # API routes
│   │   ├── stocks/
│   │   │   └── route.ts
│   │   └── auth/
│   │       └── callback/
│   │           └── route.ts
│   │
│   ├── layout.tsx                   # Root layout
│   ├── globals.css                  # Global styles
│   ├── error.tsx                    # Error boundary
│   ├── not-found.tsx                # 404 page
│   └── loading.tsx                  # Loading state
│
├── components/
│   ├── ui/                          # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── input.tsx
│   │
│   └── features/                    # Feature-specific components
│       ├── stocks/
│       │   ├── StockList.tsx
│       │   └── StockCard.tsx
│       ├── crypto/
│       │   ├── CryptoList.tsx
│       │   └── CryptoCard.tsx
│       ├── auth/
│       │   ├── LoginForm.tsx
│       │   └── UserMenu.tsx
│       └── layout/
│           ├── Header.tsx
│           ├── Footer.tsx
│           └── Sidebar.tsx
│
├── lib/
│   ├── supabase/                    # Supabase client + repository
│   │   ├── client.ts                # Browser client
│   │   ├── server.ts                # Server client
│   │   ├── middleware.ts            # Auth middleware helpers
│   │   ├── stocks.ts                # Stock repository functions
│   │   └── crypto.ts                # Crypto repository functions
│   │
│   ├── i18n/                        # Internationalization
│   │   ├── config.ts
│   │   ├── request.ts
│   │   └── messages/
│   │       ├── en.json
│   │       └── zh.json
│   │
│   ├── redis/                       # Redis cache helpers
│   │   ├── client.ts
│   │   └── keys.ts
│   │
│   ├── logging/                     # Error logging
│   │   └── error-logger.ts
│   │
│   └── utils/                       # Utility functions
│       ├── formatters.ts
│       └── validators.ts
│
├── hooks/                           # Custom React hooks
│   ├── use-stocks.ts
│   ├── use-crypto.ts
│   ├── use-auth.ts
│   └── use-subscription.ts
│
├── types/                           # TypeScript types + Zod schemas
│   ├── index.ts                     # Re-exports
│   ├── schemas.ts                   # Zod schemas
│   ├── supabase.ts                  # Generated Supabase types
│   └── result.ts                    # Result type pattern
│
└── middleware.ts                    # Next.js middleware (auth, i18n)
```

## Route Groups Explained

### `(public)` - SEO-Indexed Pages

- Crawlable by search engines
- No authentication required
- Contains sitemap-included pages
- Metadata optimized for SEO

```typescript
// app/(public)/layout.tsx
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | StockTracker',
    default: 'StockTracker - Latest Market Data',
  },
  description: 'Track stocks and cryptocurrencies with real-time data.',
  openGraph: {
    type: 'website',
    siteName: 'StockTracker',
  },
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  )
}
```

### `(auth)` - Authenticated Pages

- Requires login
- Protected by middleware
- No SEO indexing needed

```typescript
// app/(auth)/layout.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <>
      <Header user={user} />
      <main>{children}</main>
    </>
  )
}
```

### `(admin)` - Admin Pages

- Requires admin role
- Double-check permissions

```typescript
// app/(admin)/layout.tsx
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <>
      <AdminHeader user={user} />
      <AdminSidebar />
      <main>{children}</main>
    </>
  )
}
```

## SEO Best Practices

### Metadata Per Page

```typescript
// app/(public)/stocks/page.tsx
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stock Prices',
  description: 'View latest stock prices and market data.',
  keywords: ['stocks', 'market', 'prices', 'trading'],
}
```

### Dynamic Metadata

```typescript
// app/(public)/stocks/[symbol]/page.tsx
import { Metadata } from 'next'

type Props = {
  params: { symbol: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stock = await getStock(params.symbol)

  return {
    title: `${stock.name} (${params.symbol})`,
    description: `Latest price and analysis for ${stock.name}.`,
  }
}
```

### Sitemap Generation

```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stocks = await getStockSymbols()

  const stockPages = stocks.map((symbol) => ({
    url: `https://stocktracker.com/stocks/${symbol}`,
    lastModified: new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  return [
    {
      url: 'https://stocktracker.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...stockPages,
  ]
}
```

### robots.txt

```typescript
// app/robots.ts
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/api'],
      },
    ],
    sitemap: 'https://stocktracker.com/sitemap.xml',
  }
}
```

## File Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `StockCard.tsx` |
| Hooks | camelCase with `use` prefix | `use-stocks.ts` |
| Utilities | camelCase | `formatters.ts` |
| Types | camelCase | `schemas.ts` |
| API Routes | lowercase | `route.ts` |
| Pages | lowercase | `page.tsx` |
