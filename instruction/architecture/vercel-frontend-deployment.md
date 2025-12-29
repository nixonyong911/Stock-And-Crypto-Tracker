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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon key | Production, Preview, Development |

**Note**: `NEXT_PUBLIC_` prefix makes variables available in browser (client-side).

## Migration from Docker to Vercel

### Changes Made

1. **Removed `output: 'standalone'`** from `next.config.js`
   - Standalone output is for Docker/self-hosting
   - Vercel handles output automatically

2. **Removed `pg` package** from `package.json`
   - Direct PostgreSQL connections don't work in serverless
   - Migrated to Supabase client

3. **Updated components** to use Supabase client
   - `StockList.tsx` - Uses `createServerSupabaseClient()`
   - `CryptoList.tsx` - Uses `createServerSupabaseClient()`
   - `FetchStatus.tsx` - Uses `createServerSupabaseClient()`

4. **Removed frontend from `docker-compose.yml`**
   - Frontend now handled by Vercel

### Files Modified

| File | Change |
|------|--------|
| `services/frontend/next.config.js` | Removed `output: 'standalone'` |
| `services/frontend/package.json` | Removed `pg`, `@types/pg` |
| `services/frontend/src/lib/db.ts` | Deleted (was direct PostgreSQL) |
| `services/frontend/src/lib/supabase/server.ts` | Added `createServerSupabaseClient()` |
| `services/frontend/src/components/StockList.tsx` | Migrated to Supabase |
| `services/frontend/src/components/CryptoList.tsx` | Migrated to Supabase |
| `services/frontend/src/components/FetchStatus.tsx` | Migrated to Supabase |
| `docker-compose.yml` | Removed frontend service |

## Supabase Client Usage

### Server Components (Data Fetching)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function getData() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('table_name')
    .select('*');
  return data;
}
```

### Client Components (Browser)

```typescript
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
const { data, error } = await supabase
  .from('table_name')
  .select('*');
```

## Deployment Process

### Automatic Deployment
1. Push changes to `main` branch
2. Vercel detects changes in `services/frontend/`
3. Builds and deploys automatically
4. Available at production URL within ~1-2 minutes

### Manual Deployment (Vercel CLI)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from frontend directory
cd services/frontend
vercel --prod
```

## Verification

### Check Deployment Status
1. Go to Vercel Dashboard
2. View deployment logs
3. Check production URL

### Test Application
```powershell
# Test production URL
Invoke-WebRequest -Uri "https://your-app.vercel.app" -UseBasicParsing
```

## Troubleshooting

### Build Fails - Missing Environment Variables
- Ensure all `NEXT_PUBLIC_*` variables are set in Vercel Dashboard
- Check that variables are enabled for the correct environment

### Database Connection Errors
- Verify Supabase URL and keys are correct
- Check RLS policies allow access from frontend

### Deployment Not Triggering
- Verify root directory is set to `services/frontend`
- Check that changes are in the frontend directory
- Manual redeploy: Vercel Dashboard → Deployments → Redeploy

## Related Files

| File | Purpose |
|------|---------|
| `services/frontend/next.config.js` | Next.js configuration |
| `services/frontend/package.json` | Dependencies |
| `services/frontend/src/lib/supabase/client.ts` | Browser Supabase client |
| `services/frontend/src/lib/supabase/server.ts` | Server Supabase client |






















