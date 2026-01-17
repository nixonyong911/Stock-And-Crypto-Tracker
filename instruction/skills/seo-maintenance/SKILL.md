---
name: seo-maintenance
description: Guide for maintaining SEO when adding new pages or content to the frontend. Use when creating new pages, adding blog posts, updating routes, or modifying site structure. Covers metadata requirements, JSON-LD schemas, sitemap updates, and i18n. Triggers on "add new page", "create blog post", "SEO checklist", "new frontend route".
---

# SEO Maintenance

## When to Use

Apply this skill when:
- Creating a new page in the frontend
- Adding a new blog post (MDX)
- Modifying site navigation
- Updating existing page metadata
- Adding new routes or sections

## Quick Checklist for New Pages

Every new page MUST have:

- [ ] **Page file** at `src/app/[locale]/[page-name]/page.tsx`
- [ ] **Metadata** with title, description, keywords, openGraph
- [ ] **JSON-LD schema** appropriate to page type
- [ ] **Translations** in both `en.json` and `zh.json`
- [ ] **Sitemap entry** (auto for static routes, verify for dynamic)
- [ ] **Navigation links** in header/footer if user-facing

## Reference Navigation

| Task | Reference |
|------|-----------|
| Creating a new page | [page-checklist.md](references/page-checklist.md) |
| Adding a blog post | [blog-post-guide.md](references/blog-post-guide.md) |
| JSON-LD schemas | [schema-templates.md](references/schema-templates.md) |

## Page Structure Template

```typescript
// src/app/[locale]/[page-name]/page.tsx
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";

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
    keywords: ["keyword1", "keyword2"],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PageName({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {/* Page content */}
      </main>
      <Footer />
    </div>
  );
}
```

## i18n Pattern

Add translations to both files:

**en.json:**
```json
"pageNamePage": {
  "meta": {
    "title": "Page Title | Stock And Crypto Tracker",
    "description": "Page description for SEO (150-160 chars)"
  },
  "hero": {
    "title": "Page Heading",
    "subtitle": "Supporting text"
  }
}
```

**zh.json:**
```json
"pageNamePage": {
  "meta": {
    "title": "页面标题 | Stock And Crypto Tracker",
    "description": "SEO页面描述（150-160字符）"
  },
  "hero": {
    "title": "页面标题",
    "subtitle": "支持文本"
  }
}
```

## Sitemap

Static routes are auto-included via `src/app/sitemap.ts`. For new static pages:

1. Add the route to the `routes` array in `sitemap.ts`
2. Set appropriate `changeFrequency` and `priority`

Blog posts are automatically included via `getAllPosts()`.

## Navigation Updates

When adding user-facing pages:

1. **Header** (`src/components/layout/header.tsx`): Add to main nav if primary
2. **Footer** (`src/components/layout/footer.tsx`): Add to appropriate section

## Blog Post Creation

See [blog-post-guide.md](references/blog-post-guide.md) for detailed instructions.

Quick steps:
1. Create `content/blog/[slug].mdx`
2. Add frontmatter (title, date, excerpt, category)
3. Write content in Markdown
4. Post auto-appears in blog listing and sitemap
