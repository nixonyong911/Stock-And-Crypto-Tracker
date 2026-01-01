---
name: cli-vercel
description: Vercel CLI for frontend deployment. Use when deploying the Next.js frontend to Vercel.
triggers:
  - "vercel deploy"
  - "deploy frontend"
  - "vercel cli"
---

# Vercel CLI Skill

## Overview

Vercel CLI commands for deploying the Next.js frontend application.

---

## Installation

```bash
npm i -g vercel
```

---

## Deploy Commands

```bash
# Navigate to frontend
cd services/frontend

# Deploy to production
vercel --prod

# Deploy preview (staging)
vercel
```

---

## Environment Variables

Frontend uses Vercel environment variables synced from Infisical:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon key |

These are automatically synced via Infisical integration.

---

## Deployment Notes

- **Automatic**: Pushes to `main` branch auto-deploy via GitHub integration
- **Manual**: Use `vercel --prod` for immediate deployment
- **Preview**: Use `vercel` without `--prod` for preview URLs

---

## Related

- [vercel-frontend-deployment](../../architecture/vercel-frontend-deployment.md) - Deployment architecture
- [secrets-infisical](../../rules/secrets-infisical.md) - Environment variable sync



