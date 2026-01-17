# JSON-LD Schema Templates

Ready-to-use JSON-LD schema templates for different page types.

## When to Use

Add JSON-LD schemas to improve search result appearance (rich snippets).

## Schema by Page Type

### WebPage (Default)

For general pages without specific schema:

```typescript
const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Page Title",
  description: "Page description",
  url: "https://stockandcryptotracker.com/page-path",
  isPartOf: {
    "@type": "WebSite",
    name: "Stock And Crypto Tracker",
    url: "https://stockandcryptotracker.com",
  },
};
```

### AboutPage

```typescript
const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Us - Stock And Crypto Tracker",
  description: "About description",
  url: "https://stockandcryptotracker.com/about",
  mainEntity: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
    description: "Company description",
    foundingDate: "2025",
  },
};
```

### ContactPage

```typescript
const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Us",
  description: "Contact description",
  url: "https://stockandcryptotracker.com/contact",
  mainEntity: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
    email: "contact@stockandcryptotracker.com",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "contact@stockandcryptotracker.com",
      availableLanguage: ["English", "Chinese"],
    },
  },
};
```

### FAQPage

Enables FAQ rich snippets in Google:

```typescript
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Stock And Crypto Tracker?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Stock And Crypto Tracker is...",
      },
    },
    {
      "@type": "Question",
      name: "How much does it cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We offer a free plan...",
      },
    },
  ],
};
```

### Product (Pricing Page)

```typescript
const productSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Stock And Crypto Tracker",
  description: "AI-powered market analysis",
  brand: {
    "@type": "Brand",
    name: "Stock And Crypto Tracker",
  },
  offers: [
    {
      "@type": "Offer",
      name: "Free Plan",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Pro Plan",
      price: "20",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  ],
};
```

### Article (Blog Posts)

Auto-generated for blog posts, but template:

```typescript
const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Article Title",
  description: "Article excerpt",
  datePublished: "2026-01-17",
  dateModified: "2026-01-17",
  author: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
    url: "https://stockandcryptotracker.com",
  },
  publisher: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
    logo: {
      "@type": "ImageObject",
      url: "https://stockandcryptotracker.com/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://stockandcryptotracker.com/blog/article-slug",
  },
};
```

### HowTo

For step-by-step guides:

```typescript
const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Get Started",
  description: "Step-by-step guide",
  step: [
    {
      "@type": "HowToStep",
      name: "Step 1 Title",
      text: "Step 1 description",
      position: 1,
    },
    {
      "@type": "HowToStep",
      name: "Step 2 Title",
      text: "Step 2 description",
      position: 2,
    },
  ],
  totalTime: "PT5M",
};
```

## Implementation

Add to page component:

```tsx
export default async function PageName({ params }: Props) {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema),
        }}
      />
      {/* Page content */}
    </div>
  );
}
```

## Validation

Test schemas at:
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)

## Global Schemas

These are already in `src/components/seo/json-ld.tsx` (loaded site-wide):
- Organization
- WebSite
- SoftwareApplication
- HowTo (for homepage)

Don't duplicate these on individual pages.
