# Meta Optimization

Optimize page metadata for search engines and social sharing.

## Title Tag Best Practices

### Format

```
Primary Keyword - Secondary Info | Brand Name
```

### Guidelines

| Aspect | Recommendation |
|--------|---------------|
| Length | 50-60 characters (display limit) |
| Keyword placement | Primary keyword near beginning |
| Branding | Brand name at end (if space) |
| Uniqueness | Every page must have unique title |

### Examples

```typescript
// Good titles
"Stock Prices - Live Market Data & Charts | StockTracker"
"Bitcoin Price Today - BTC/USD Live Chart"
"AAPL Stock Price & News - Apple Inc."

// Bad titles
"Home"                                    // Too generic
"Stock Prices Stock Market Stocks Buy"    // Keyword stuffing
"Welcome to Our Amazing Stock Tracking Website That Shows Prices"  // Too long
```

## Meta Description Best Practices

### Guidelines

| Aspect | Recommendation |
|--------|---------------|
| Length | 150-160 characters |
| Content | Summarize page + include CTA |
| Keywords | Include primary keyword naturally |
| Uniqueness | Every page needs unique description |

### Formula

```
[What the page offers] + [Key benefit] + [Call to action]
```

### Examples

```typescript
// Good description
"Track real-time stock prices for top companies. View charts, market trends, and detailed analysis. Start monitoring your portfolio today."

// Bad descriptions
"Click here to see stocks"               // No value proposition
"We have stocks and crypto and prices"   // No structure
// (Empty or duplicate)                  // Missing entirely
```

## Open Graph Tags

For social media sharing (Facebook, LinkedIn).

### Required Tags

```typescript
export const metadata: Metadata = {
  openGraph: {
    title: 'Stock Prices - StockTracker',
    description: 'Track real-time stock prices and market data.',
    type: 'website',
    url: 'https://stocktracker.com/stocks',
    siteName: 'StockTracker',
    images: [
      {
        url: '/og-stocks.png',
        width: 1200,
        height: 630,
        alt: 'StockTracker - Stock Prices',
      },
    ],
  },
}
```

### Image Specifications

| Platform | Size | Ratio |
|----------|------|-------|
| Facebook | 1200x630 | 1.91:1 |
| LinkedIn | 1200x627 | 1.91:1 |
| Twitter | 1200x600 | 2:1 |

## Twitter Card Tags

```typescript
export const metadata: Metadata = {
  twitter: {
    card: 'summary_large_image',  // or 'summary' for smaller
    title: 'Stock Prices - StockTracker',
    description: 'Track real-time stock prices and market data.',
    images: ['/twitter-card.png'],
    creator: '@stocktracker',
  },
}
```

### Card Types

| Type | Use Case |
|------|----------|
| `summary` | Article/content pages |
| `summary_large_image` | Visual content, landing pages |
| `player` | Video/audio content |

## Canonical URLs

Prevent duplicate content issues:

```typescript
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://stocktracker.com/stocks',
  },
}
```

### When to Use

- Same content accessible via multiple URLs
- URL parameters (sorting, filtering)
- HTTP/HTTPS or www/non-www variations
- Syndicated content

## Robots Meta Tags

Control search engine behavior:

```typescript
export const metadata: Metadata = {
  robots: {
    index: true,      // Allow indexing
    follow: true,     // Follow links
    nocache: false,   // Allow caching
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,        // No limit
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
}
```

### Common Configurations

| Scenario | Configuration |
|----------|--------------|
| Public pages | `index: true, follow: true` |
| Auth-required pages | `index: false, follow: false` |
| Paginated pages | `index: true, follow: true` + canonical to page 1 |
| Thin content | `index: false, follow: true` |

## Structured Data (JSON-LD)

### Organization Schema

```typescript
const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'StockTracker',
  url: 'https://stocktracker.com',
  logo: 'https://stocktracker.com/logo.png',
  sameAs: [
    'https://twitter.com/stocktracker',
    'https://linkedin.com/company/stocktracker',
  ],
}
```

### WebPage Schema

```typescript
const pageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Stock Prices',
  description: 'Track real-time stock prices.',
  url: 'https://stocktracker.com/stocks',
  isPartOf: {
    '@type': 'WebSite',
    name: 'StockTracker',
    url: 'https://stocktracker.com',
  },
}
```

## Meta Tag Checklist

- [ ] Title tag (50-60 chars, keyword near start)
- [ ] Meta description (150-160 chars, with CTA)
- [ ] Open Graph title, description, image
- [ ] Twitter card configuration
- [ ] Canonical URL (if needed)
- [ ] Robots meta (appropriate settings)
- [ ] JSON-LD schema (if applicable)
- [ ] Language declaration
- [ ] Viewport meta tag
