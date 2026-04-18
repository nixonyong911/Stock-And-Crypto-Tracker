---
name: managing-seo
description: Use when publishing blog posts, checking SEO health, updating sitemap or IndexNow, adding new public pages, debugging indexation issues, or when the user mentions "SEO," "search ranking," "Google Search Console," "sitemap," or "indexation"
---

# Managing SEO

## Overview

Reference guide for maintaining and extending the SEO/AEO infrastructure on stockandcryptotracker.com. Covers what's automated, what needs manual action, and how to extend.

## When to Use

- Adding a new public page or route
- Publishing a new blog post
- Checking SEO health or debugging indexation
- Extending structured data schemas
- Updating IndexNow or sitemap
- User asks about search ranking, traffic, or Google Search Console

## Architecture

| Layer | Files | Purpose |
|-------|-------|---------|
| Sitemap | `src/app/sitemap.ts` | Dynamic XML sitemap — auto-includes blog posts, command docs, ticker pages |
| Robots | `src/app/robots.ts` | Crawler rules — allows AI crawlers, blocks private routes |
| Metadata | `src/lib/seo/alternates.ts` | `buildAlternates(path, locale)` for canonical + hreflang on every page |
| Structured data | `src/components/seo/json-ld.tsx` | Global schemas: WebSite, Organization, SoftwareApplication, HowTo, Speakable |
| Structured data | `src/components/seo/structured-data.tsx` | Reusable: `BreadcrumbJsonLd`, `ArticleJsonLd` |
| OG images | `src/app/og/route.tsx` | Default 1200x630 OG image |
| OG images | `src/app/og/ticker/route.tsx` | Per-ticker dynamic OG image (symbol, signal, price) |
| AEO | `src/app/llms.txt/route.ts` | Product summary for AI crawlers |
| AEO | `src/app/llms-full.txt/route.ts` | Full reference with bot commands |
| Analytics | `src/lib/seo/analytics-events.ts` | GA4 custom events: `trackTickerCTA`, `trackBlogCTA`, `trackFAQExpand` |
| Health | `src/app/api/seo/health/route.ts` | Live health check endpoint |
| Schemas audit | `src/app/api/seo/schemas/route.ts` | Lists all deployed structured data types |
| IndexNow | `.github/workflows/indexnow.yml` | Auto-pings Google + Bing/Yandex on push to main |
| Consent | `src/components/analytics/consent-banner.tsx` | GDPR cookie banner gating GA4 + Vercel Analytics |
| Proxy | `src/proxy.ts` | Public route matcher — new public pages MUST be added here |

All paths above are relative to `services/frontend/`.

## Automated (No Action Needed)

- **Every push to main**: Google sitemap ping + IndexNow push (via GHA workflow)
- **Ticker pages**: Auto-update hourly via ISR (`revalidate = 3600`)
- **Sitemap**: Dynamically includes all active tickers, blog posts, command docs
- **Analytics**: Consent-gated GA4 + Vercel Analytics load automatically

## Quick Reference: Common Tasks

### Publishing a Blog Post

1. Create `services/frontend/content/blog/<slug>.mdx` with frontmatter:

```yaml
---
title: "English Title"
title_zh: "中文标题"
date: "YYYY-MM-DD"
excerpt: "English excerpt"
excerpt_zh: "中文摘要"
category: "blog" | "announcement" | "feature" | "notice"
---
```

2. The post auto-appears in sitemap, blog index, and RSS
3. Add the URL to `.github/workflows/indexnow.yml` URLS array for faster indexing
4. Commit and push — IndexNow + Google ping happen automatically

### Adding a New Public Page

1. Create the page under `src/app/[locale]/<route>/page.tsx`
2. Add `generateMetadata` with `buildAlternates`:

```typescript
import { buildAlternates } from "@/lib/seo/alternates";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    title: "...",
    description: "...",
    alternates: buildAlternates("/<route>", locale),
  };
}
```

3. Add route to `src/proxy.ts` public route matcher:

```typescript
"/:locale/<route>(.*)",
```

4. Add to sitemap in `src/app/sitemap.ts` routes array
5. Add `BreadcrumbJsonLd` if the page has a logical hierarchy
6. Add the URL to IndexNow workflow URLS array

### Checking SEO Health

```bash
curl https://stockandcryptotracker.com/api/seo/health | python3 -m json.tool
```

Returns: `overall` status (healthy/degraded/unhealthy) with checks for robots.txt, sitemap, llms.txt, OG image, IndexNow key, blog count, command docs.

### Viewing Schema Inventory

```bash
curl https://stockandcryptotracker.com/api/seo/schemas | python3 -m json.tool
```

### Validating Structured Data

Use the URLs in `/api/seo/schemas` response `validationTools` array:
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org/
- Bing Markup Validator: https://www.bing.com/webmasters/markup-validator

### Adding Structured Data to a Page

Use existing components from `src/components/seo/`:

```tsx
import { BreadcrumbJsonLd, ArticleJsonLd } from "@/components/seo";

// In your page component:
<BreadcrumbJsonLd
  locale={locale}
  items={[
    { name: "Home", path: "" },
    { name: "Page Name" },
  ]}
/>
```

For new schema types, add a component to `src/components/seo/structured-data.tsx` and export from `src/components/seo/index.ts`.

## IndexNow Key

- Key: `d41864d7353d4b0781f94fc09d9ba8c0`
- Key file: `services/frontend/public/d41864d7353d4b0781f94fc09d9ba8c0.txt`
- Workflow: `.github/workflows/indexnow.yml`

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| New page returns 401/redirect | Add route to `src/proxy.ts` `isPublicRoute` matcher |
| Page missing from sitemap | Add route to `src/app/sitemap.ts` |
| Missing hreflang/canonical | Use `buildAlternates(path, locale)` in `generateMetadata` |
| OG image not showing | Ensure path doesn't hit i18n middleware — check `src/proxy.ts` skip list |
| API route blocked | Add to `isPublicRoute` matcher (e.g., `/api/seo(.*)`) |
| Blog post not indexed | Add URL to IndexNow workflow, verify it's in sitemap |
| Ticker page 404 | Verify ticker is `is_active=true` in `stock_tickers` or `crypto_tickers` |

## Monitoring (Monthly)

| Task | Where |
|------|-------|
| Check crawl errors | Google Search Console > Pages |
| Review search queries | Google Search Console > Performance > Queries |
| Check Bing indexation | Bing Webmaster Tools > Search Performance |
| Run health check | `curl .../api/seo/health` |
| Review Core Web Vitals | Google Search Console > Experience > Core Web Vitals |
| Check Vercel Analytics | Vercel Dashboard > Analytics tab |

## Related Skills

- **seo-audit**: For comprehensive SEO audits and diagnostics
- **cicd-pipeline**: For understanding the deploy pipeline that triggers IndexNow
- **frontend-patterns**: For React/Next.js patterns used in page components
