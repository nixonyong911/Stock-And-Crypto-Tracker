# Structure Architecture

Optimize content structure for search engines and user experience.

## Header Hierarchy

### Best Practices

| Level | Purpose | Usage |
|-------|---------|-------|
| H1 | Page title | ONE per page, matches main topic |
| H2 | Main sections | 3-8 per page |
| H3 | Subsections | Under related H2 |
| H4-H6 | Deep nesting | Use sparingly |

### Structure Blueprint

```
H1: Primary Keyword Focus
├── H2: Major Section (Secondary KW)
│   ├── H3: Subsection (LSI)
│   └── H3: Subsection (Entity)
├── H2: Major Section (Related KW)
│   ├── H3: Subsection
│   └── H3: Subsection
└── H2: FAQ Section
    ├── H3: Question 1
    └── H3: Question 2
```

### Example

```markdown
# Stock Market Prices                    <!-- H1: Primary keyword -->

## Understanding Stock Prices            <!-- H2: Related keyword -->
### How Prices Are Determined            <!-- H3: Subsection -->
### Factors Affecting Stock Prices       <!-- H3: Subsection -->

## Live Stock Data                       <!-- H2: Feature section -->
### Real-Time Updates                    <!-- H3: Feature detail -->

## Market Analysis                       <!-- H2: Topical depth -->
### Technical Analysis                   <!-- H3: Entity -->
### Fundamental Analysis                 <!-- H3: Entity -->

## Frequently Asked Questions            <!-- H2: FAQ for snippets -->
### What affects stock prices?           <!-- H3: Question -->
### When is the best time to buy?        <!-- H3: Question -->
```

## Content Siloing

Organize content into topical clusters:

```
/stocks/                          # Pillar page
├── /stocks/how-to-buy/           # Supporting content
├── /stocks/market-analysis/       # Supporting content
├── /stocks/terminology/           # Supporting content
└── /stocks/[symbol]/             # Individual pages

/crypto/                          # Pillar page
├── /crypto/bitcoin/              # Supporting content
├── /crypto/ethereum/             # Supporting content
└── /crypto/trading-guide/        # Supporting content
```

### Internal Linking Matrix

| From Page | Links To |
|-----------|----------|
| Pillar page | All supporting pages |
| Supporting pages | Pillar + related supporting |
| Individual pages | Pillar + 2-3 relevant supporting |

## Schema Markup

### High-Priority Schemas

| Schema | Use Case |
|--------|----------|
| `Organization` | Site-wide, in root layout |
| `WebSite` | Site-wide, with search action |
| `WebPage` | Every page |
| `BreadcrumbList` | Navigation path |
| `FAQPage` | FAQ sections |
| `HowTo` | Step-by-step guides |

### BreadcrumbList Schema

```typescript
// components/Breadcrumbs.tsx
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <nav aria-label="Breadcrumb">
        <ol>
          {items.map((item, i) => (
            <li key={i}>
              <a href={item.url}>{item.name}</a>
              {i < items.length - 1 && ' / '}
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}
```

### WebSite Schema with Search

```typescript
const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'StockTracker',
  url: 'https://stocktracker.com',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://stocktracker.com/search?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
}
```

## URL Structure

### Best Practices

| Aspect | Recommendation | Example |
|--------|---------------|---------|
| Length | Short, descriptive | `/stocks/aapl` |
| Keywords | Include primary keyword | `/stock-prices` |
| Separators | Use hyphens | `/market-analysis` |
| Case | Lowercase | `/bitcoin-price` |
| Trailing slash | Be consistent | Pick one, stick with it |

### Good vs Bad URLs

```
Good:
/stocks
/stocks/aapl
/crypto/bitcoin
/market-analysis

Bad:
/page?id=123
/stocks/AAPL (mixed case)
/stock_prices (underscores)
/the-complete-guide-to-understanding-stock-market-prices (too long)
```

## Table of Contents

For long-form content (>1500 words):

```typescript
// components/TableOfContents.tsx
export function TableOfContents({ headings }: { headings: Heading[] }) {
  return (
    <nav aria-label="Table of contents">
      <h2>Contents</h2>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`}>{heading.text}</a>
            {heading.children && (
              <ul>
                {heading.children.map((child) => (
                  <li key={child.id}>
                    <a href={`#${child.id}`}>{child.text}</a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

## Structure Checklist

Header hierarchy:
- [ ] Single H1 per page
- [ ] Logical H2 → H3 flow
- [ ] Keywords in headers (naturally)
- [ ] No skipped levels (H1 → H3)

Schema markup:
- [ ] Organization schema (site-wide)
- [ ] WebPage schema (per page)
- [ ] BreadcrumbList (if navigation)
- [ ] FAQ/HowTo (if applicable)

URL structure:
- [ ] Short and descriptive
- [ ] Keywords included
- [ ] Hyphens as separators
- [ ] Lowercase

Internal linking:
- [ ] Pillar → supporting links
- [ ] Related content links
- [ ] Breadcrumb navigation
