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

1. **Playwright Visual Check**
   - Navigate to `http://localhost:3000`
   - Capture page snapshot
   - Visually confirm changes render correctly

2. **Check Next.js Dev Tools**
   - Look at bottom-left corner for issues badge
   - Address any errors/warnings shown

3. **Before Push - Build Check**
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

**Details:** See [references/architecture-patterns.md](references/architecture-patterns.md)

## Error Handling

- Centralized i18n with next-intl
- URL-based locales (`/en/`, `/zh/`, etc.)
- Multi-destination logging: Console, Supabase `frontend_error_logs`, Grafana

**Details:** See [references/error-handling.md](references/error-handling.md)

## Security Rules

1. **Defense in Depth**
   - Supabase RLS at database level
   - Next.js middleware for route protection
   - Component-level auth checks

2. **Environment Variables**
   - Only `NEXT_PUBLIC_*` accessible client-side
   - Sensitive operations in Server Components/Actions only

3. **Protected Sections**
   - Member-only pages require authentication
   - Subscription sections require active subscription
   - Cookie handling via Supabase SSR helpers

## Caching Strategy

- Redis with `frontend:` namespace prefix (shared server)
- TanStack Query for client-side caching
- MUST use prefix to avoid conflicts with other services

**Details:** See [references/caching-strategy.md](references/caching-strategy.md)

## Data Layer

- All DB schema defined in `services/common/StockTracker.Data/`
- Migrations via `StockTracker.Data.Migrations/` (shared with .NET workers)
- Frontend types generated from Supabase + Zod validation

**Details:** See [references/folder-structure.md](references/folder-structure.md)

## Quick Reference

| Task | Command |
|------|---------|
| Start dev server | `cd services/frontend && infisical run --env=dev -- npm run dev` |
| Build check | `infisical run --env=dev -- npm run build` |
| Generate types | `npx supabase gen types typescript --project-id <id> > src/types/supabase.ts` |
| Add shadcn component | `npx shadcn@latest add <component>` |
