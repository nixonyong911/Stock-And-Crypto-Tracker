# Middleware

## File Location

```
services/frontend/
├── src/
│   ├── middleware.ts              # Root middleware (create here)
│   └── lib/supabase/middleware.ts # Supabase client helper
```

## Implementation

```typescript
// src/middleware.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'

const publicRoutes = ['/', '/login', '/signup', '/api/health']
const authRoutes = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = createClient(request)

  // Get session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect authenticated users away from auth pages
  if (user && authRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect private routes
  if (!user && !publicRoutes.some(route => pathname === route || pathname.startsWith('/api/'))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

## Supabase Client Helper

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export const createClient = (request: NextRequest) => {
  let response = NextResponse.next({ request: { headers: request.headers } })

  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  return response
}
```

## Route Protection Patterns

| Route Pattern | Auth Required | Notes |
|---------------|---------------|-------|
| `/` | No | Public landing |
| `/login`, `/signup` | No | Redirect if authenticated |
| `/dashboard/*` | Yes | Member-only |
| `/admin/*` | Yes + Role | Check role in page |
| `/api/*` | Varies | Per-endpoint |

## Locale Support (Optional)

For i18n with next-intl, modify matcher and add locale handling:

```typescript
import createMiddleware from 'next-intl/middleware'
import { locales, defaultLocale } from '@/lib/i18n/config'

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
})

export async function middleware(request: NextRequest) {
  // Auth checks first, then locale
  // ...auth logic...

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/', '/(en|zh)/:path*'],
}
```
