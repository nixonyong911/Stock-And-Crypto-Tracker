---
name: development-nextjs-locally
description: Guide for local Next.js frontend development workflow. Use when developing, modifying, or debugging the frontend at services/frontend. Covers local dev setup, Playwright verification, architecture patterns, and deployment context. Triggers on "develop frontend", "local frontend", "next.js development", "modify frontend", "frontend changes".
---

# Next.js Local Development

## Deployment Context

- Frontend hosted on **Vercel** (free tier, auto CI/CD)
- Git push to `main` triggers Vercel deployment (NOT VM docker-compose)
- Future: Will integrate into VM ecosystem with custom domain
- Standard git workflow applies, but VM steps in personal rules do NOT apply to frontend

## Local Development Workflow

```bash
cd services/frontend
infisical run --env=dev -- npm run dev
```

This injects `NEXT_PUBLIC_*` environment variables before Next.js starts.

## Verification Process

After making changes:

1. **Lint & Type Check**
   ```bash
   cd services/frontend
   npm run lint && npm run type-check
   ```

2. **Playwright Visual Check**
   - Navigate to `http://localhost:3000`
   - Capture page snapshot
   - Visually confirm changes render correctly

3. **Check Next.js Dev Tools**
   - Look at bottom-left corner for issues badge
   - Address any errors/warnings shown

4. **Before Push - Build Check**
   ```bash
   infisical run --env=dev -- npm run build
   ```
   Ensures production build succeeds before triggering Vercel CI/CD.

## Architecture Overview

| Aspect | Pattern |
|--------|---------|
| Components | Hybrid - shared UI + feature-specific |
| State | Context (auth/theme) + TanStack Query (server data) |
| Styling | shadcn/ui + Tailwind CSS |
| Data Layer | Repository functions (reads) + Server Actions (writes) |
| Type Safety | Supabase generated types + Zod runtime validation |
| Responsiveness | Mobile-first Tailwind breakpoints (`sm:`, `md:`, `lg:`) |
| Device Support | Viewport meta tag, touch-friendly targets (min 44px) |
| CDN | Vercel Edge Network (automatic), `next/image` optimization |

**Maintainability:** Enforced via TypeScript strict mode, ESLint rules, and modular `lib/`/`components/`/`types/` separation.

**Details:** See [references/architecture-patterns.md](references/architecture-patterns.md)

## Error Handling

- Centralized i18n with next-intl
- URL-based locales (`/en/`, `/zh/`, etc.)
- Multi-destination logging: Console, Supabase `frontend_error_logs`, Grafana

**Details:**
- [references/error-handling.md](references/error-handling.md) - Result pattern, Error boundaries, ErrorDisplay
- [references/i18n-error-messages.md](references/i18n-error-messages.md) - next-intl config, message structure
- [references/error-logging.md](references/error-logging.md) - Console, Supabase, Grafana logging

## Security Rules

### Transport & Headers
- **HTTPS by default** - Vercel enforces HTTPS; local dev uses HTTP (acceptable)
- **CSP** - Content Security Policy via `next.config.js` headers
- **HSTS** - Strict-Transport-Security header (Vercel handles)
- **X-Frame-Options** - Prevent clickjacking via headers config

### Input & Output
- **Input validation** - Zod schemas in Server Actions, never trust client
- **XSS protection** - React auto-escapes; avoid `dangerouslySetInnerHTML`
- **CSRF protection** - Server Actions use built-in CSRF tokens

### Auth & Access
- Supabase RLS at database level
- Next.js middleware for route protection
- Component-level auth checks
- Only `NEXT_PUBLIC_*` accessible client-side

### Dependency Security
- Run `npm audit` before releases
- Keep dependencies updated (`npm outdated`)
- Review changelogs for security patches

**Details:** See [references/middleware.md](references/middleware.md)

## Caching Strategy

- **Upstash Redis** (serverless, HTTP-based) with `frontend:` namespace prefix
- TanStack Query for client-side caching
- MUST use prefix to avoid conflicts with other services
- Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (in Infisical)

**Details:** See [references/caching-strategy.md](references/caching-strategy.md)

## Data Layer

- All DB schema defined in `services/common/StockTracker.Data/`
- Migrations via `StockTracker.Data.Migrations/` (shared with .NET workers)
- Frontend types generated from Supabase + Zod validation

**Details:** See [references/folder-structure.md](references/folder-structure.md)

## Additional Patterns

| Pattern | Reference |
|---------|-----------|
| Testing (Vitest/Playwright) | [references/testing-strategy.md](references/testing-strategy.md) |
| Form Handling (Zod/Server Actions) | [references/form-patterns.md](references/form-patterns.md) |
| Loading States (Suspense/Skeletons) | [references/loading-patterns.md](references/loading-patterns.md) |
| Data Fetching (Pagination/Search) | [references/data-fetching-patterns.md](references/data-fetching-patterns.md) |

## Quick Reference

| Task | Command |
|------|---------|
| Start dev server | `cd services/frontend && infisical run --env=dev -- npm run dev` |
| Build check | `infisical run --env=dev -- npm run build` |
| Generate types | `npx supabase gen types typescript --project-id <id> > src/types/supabase.ts` |
| Add shadcn component | `npx shadcn@latest add <component>` |
| Install Upstash Redis | `npm install @upstash/redis` |