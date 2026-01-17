# New Page Checklist

Step-by-step guide for adding a new page to the frontend with proper SEO.

## Step 1: Create Page File

Create `src/app/[locale]/[page-name]/page.tsx`:

```typescript
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { PageContent } from "./page-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pageNamePage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: ["relevant", "keywords", "here"],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PageNamePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <PageContent />
      </main>
      <Footer />
    </div>
  );
}
```

## Step 2: Create Content Component

For client-side interactivity, create `page-content.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";

export function PageContent() {
  const t = useTranslations("pageNamePage");

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <h1>{t("hero.title")}</h1>
        {/* Content */}
      </div>
    </section>
  );
}
```

## Step 3: Add Translations

**en.json:**
```json
"pageNamePage": {
  "meta": {
    "title": "Page Title | Stock And Crypto Tracker",
    "description": "Compelling description with keywords (150-160 chars)"
  },
  "hero": {
    "title": "Main Heading (H1)",
    "subtitle": "Supporting description"
  }
}
```

**zh.json:** Add Chinese translations with same structure.

## Step 4: Add JSON-LD Schema (if needed)

Add to page.tsx for rich snippets:

```typescript
const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage", // or appropriate type
  name: "Page Title",
  description: "Page description",
  url: "https://stockandcryptotracker.com/page-name",
};

// In return statement:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
/>
```

## Step 5: Update Sitemap

Edit `src/app/sitemap.ts` and add to routes array:

```typescript
{ path: "/page-name", changeFrequency: "weekly", priority: 0.7 },
```

## Step 6: Add Navigation Links

If user-facing page:

**Header** (`src/components/layout/header.tsx`):
```typescript
<Link href="/page-name">{t("pageName")}</Link>
```

**Footer** (`src/components/layout/footer.tsx`):
```typescript
<Link href="/page-name">{t("pageName")}</Link>
```

Add translation key to `nav` or `footer` section.

## Step 7: Verify

1. Run `npm run build` to check for errors
2. Test both `/en/page-name` and `/zh/page-name`
3. Check metadata in browser dev tools
4. Validate JSON-LD at [schema.org validator](https://validator.schema.org/)

## Metadata Guidelines

| Element | Guideline |
|---------|-----------|
| Title | 50-60 chars, primary keyword first |
| Description | 150-160 chars, include CTA |
| Keywords | 5-10 relevant terms |
| H1 | One per page, matches topic |

## Common Mistakes to Avoid

- Missing translations in zh.json
- Forgetting `setRequestLocale(locale)` call
- Not adding to sitemap
- Skipping JSON-LD schema
- Using `next/link` instead of `@/lib/i18n/routing` Link
