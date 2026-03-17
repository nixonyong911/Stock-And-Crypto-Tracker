# Vercel Frontend Deployment Guide

## Overview

The Next.js frontend is hosted on Vercel with automatic Git-based deployment. When changes are pushed to the `main` branch, Vercel automatically builds and deploys the frontend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND DEPLOYMENT                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   GitHub Repository                                                  │
│         │                                                            │
│         │ git push (changes to services/frontend/)                   │
│         ▼                                                            │
│   Vercel (Auto-detect & Deploy)                                      │
│         │                                                            │
│         ├─► Build Next.js app                                        │
│         ├─► Deploy to Edge network                                   │
│         └─► Available at production URL                              │
│                                                                      │
│   Database: VM PostgREST (via Supabase JS client library)            │
│         │                                                            │
│         └─► DATABASE_URL_JS → https://nxserver.../rest/v1            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Vercel Project Configuration

| Setting | Value |
|---------|-------|
| Repository | `nixonyong911/Stock-And-Crypto-Tracker` |
| Root Directory | `services/frontend` |
| Framework Preset | Next.js (auto-detected) |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Node.js Version | 20.x |

## Environment Variables (Vercel Dashboard)

Configure in: **Vercel Dashboard → Project → Settings → Environment Variables**

| Variable | Description | Environments |
|----------|-------------|--------------|
| `DATABASE_URL_JS` | VM PostgREST base URL | Production, Preview, Development |
| `DATABASE_SERVICE_ROLE_KEY` | JWT for PostgREST service role auth | Production, Preview, Development |

These are managed via Infisical and synced to Vercel. The frontend uses the Supabase JS client library (`@supabase/supabase-js`) as the HTTP client, but it connects to the self-hosted PostgREST on the VM -- not to Supabase cloud.

## Database Access Pattern

The frontend uses `@supabase/supabase-js` as a PostgREST client. The actual database is self-hosted PostgreSQL on the VM, exposed via PostgREST with Supabase-compatible JWT auth.

### Server Components (Data Fetching)

```typescript
import { getSupabaseAdmin } from '@/lib/db/supabase';

async function getData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('table_name')
    .select('*');
  return data;
}
```

The client is initialized in `services/frontend/src/lib/db/supabase.ts` using `DATABASE_URL_JS` and `DATABASE_SERVICE_ROLE_KEY`.

## Deployment Process

### Automatic Deployment
1. Push changes to `main` branch
2. Vercel detects changes in `services/frontend/`
3. Builds and deploys automatically
4. Available at production URL within ~1-2 minutes

### Manual Deployment (Vercel CLI)
```bash
cd services/frontend
vercel --prod
```

## Verification

### Check Deployment Status
1. Go to Vercel Dashboard
2. View deployment logs
3. Check production URL

## Troubleshooting

### Build Fails - Missing Environment Variables
- Ensure `DATABASE_URL_JS` and `DATABASE_SERVICE_ROLE_KEY` are set in Vercel Dashboard
- Check that variables are enabled for the correct environment

### Database Connection Errors
- Verify VM PostgREST is running: `docker ps | grep postgrest`
- Check that the JWT secret matches between PostgREST and the service role key
- Confirm the VM is reachable from Vercel's edge network

### Deployment Not Triggering
- Verify root directory is set to `services/frontend`
- Check that changes are in the frontend directory
- Manual redeploy: Vercel Dashboard → Deployments → Redeploy

## Related Files

| File | Purpose |
|------|---------|
| `services/frontend/next.config.js` | Next.js configuration |
| `services/frontend/package.json` | Dependencies |
| `services/frontend/src/lib/db/supabase.ts` | PostgREST client (uses Supabase JS SDK) |
