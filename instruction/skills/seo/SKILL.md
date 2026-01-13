---
name: seo
description: SEO optimization guidance for frontend development. Use when creating pages, writing content, adding metadata, or structuring headers. Covers keyword strategy, meta optimization, featured snippets, and content structure. Triggers on "SEO", "search optimization", "meta tags", "featured snippets", "keywords", "search ranking", "Open Graph".
---

# SEO Optimization

## When to Apply SEO

Apply SEO practices during:
- Creating new pages
- Writing page content
- Adding metadata and Open Graph tags
- Structuring headers (H1-H6)
- Building FAQ sections
- Creating schema markup

## Quick Checklist

Every page MUST have:

- [ ] **Unique title** (50-60 characters)
- [ ] **Meta description** (150-160 characters)
- [ ] **Single H1** matching page topic
- [ ] **Logical header hierarchy** (H1 → H2 → H3)
- [ ] **Open Graph tags** for social sharing
- [ ] **Canonical URL** if content exists elsewhere

## Reference Navigation

Read the appropriate reference based on your task:

| Task | Reference |
|------|-----------|
| Writing content, choosing words | [keyword-strategy.md](references/keyword-strategy.md) |
| Page metadata, social tags | [meta-optimization.md](references/meta-optimization.md) |
| FAQ sections, featured snippets | [snippet-optimization.md](references/snippet-optimization.md) |
| Header hierarchy, schema markup | [structure-architecture.md](references/structure-architecture.md) |

## Next.js Implementation

### Metadata API

```typescript
// app/(public)/stocks/page.tsx
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stock Prices - Latest Market Data',
  description: 'Track real-time stock prices, market trends, and trading data for top companies.',
  keywords: ['stocks', 'market', 'prices', 'trading', 'investment'],
  openGraph: {
    title: 'Stock Prices - StockTracker',
    description: 'Track real-time stock prices and market data.',
    type: 'website',
    images: ['/og-stocks.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Prices - StockTracker',
    description: 'Track real-time stock prices and market data.',
  },
}
```

### Dynamic Metadata

```typescript
// app/(public)/stocks/[symbol]/page.tsx
import { Metadata } from 'next'

type Props = { params: { symbol: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stock = await getStock(params.symbol)
  
  return {
    title: `${stock.name} (${params.symbol}) - Stock Price`,
    description: `Latest price, charts, and analysis for ${stock.name} stock.`,
  }
}
```

### JSON-LD Schema

```typescript
// components/features/stocks/StockSchema.tsx
export function StockSchema({ stock }: { stock: Stock }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: stock.name,
    identifier: stock.symbol,
    offers: {
      '@type': 'Offer',
      price: stock.price,
      priceCurrency: 'USD',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

## SEO Audit Checklist

Before deploying new pages:

### Technical
- [ ] Page loads in < 3 seconds
- [ ] Mobile responsive
- [ ] No broken links
- [ ] Images have alt text
- [ ] Proper canonical tags

### Content
- [ ] Title includes primary keyword
- [ ] H1 matches page topic
- [ ] Content answers user intent
- [ ] Internal links to related pages

### Metadata
- [ ] Unique title tag
- [ ] Compelling meta description
- [ ] Open Graph image
- [ ] Twitter card configured
