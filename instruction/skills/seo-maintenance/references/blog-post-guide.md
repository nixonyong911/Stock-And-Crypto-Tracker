# Blog Post Guide

How to create and publish blog posts using MDX.

## Quick Start

1. Create file: `content/blog/[slug].mdx`
2. Add frontmatter
3. Write content
4. Done! Post auto-appears in listing and sitemap.

## File Location

```
services/frontend/content/blog/
├── welcome.mdx
├── understanding-market-signals.mdx
└── your-new-post.mdx
```

## Frontmatter Template

```mdx
---
title: "Your Post Title"
title_zh: "您的文章标题"
date: "2026-01-17"
excerpt: "Brief description for listing page and SEO (1-2 sentences)"
excerpt_zh: "简短描述用于列表页面和SEO（1-2句话）"
category: "blog"
---

Your content here...
```

## Required Fields

| Field | Description |
|-------|-------------|
| `title` | English title (required) |
| `date` | ISO format: YYYY-MM-DD (required) |
| `excerpt` | English summary, 1-2 sentences (required) |
| `category` | One of: `blog`, `announcement`, `feature`, `notice` |

## Optional Fields

| Field | Description |
|-------|-------------|
| `title_zh` | Chinese title |
| `excerpt_zh` | Chinese summary |
| `content_zh` | Full Chinese content (if different) |

## Categories

| Category | Use For |
|----------|---------|
| `blog` | General articles, tutorials, insights |
| `announcement` | Company announcements, launches |
| `feature` | New feature releases |
| `notice` | Important notices, changes |

## Content Guidelines

### Structure

```mdx
---
frontmatter here
---

## Introduction
Opening paragraph...

## Main Section
Content with subsections...

### Subsection
More details...

## Conclusion
Wrap up and CTA...
```

### Formatting

- Use `##` for main sections (H2)
- Use `###` for subsections (H3)
- Use `-` for bullet lists
- Keep paragraphs concise
- Include a call-to-action at the end

### SEO Tips

1. **Title**: Include primary keyword
2. **Excerpt**: Compelling summary with keyword
3. **Headings**: Use keywords naturally
4. **Content**: 500+ words for SEO value
5. **Links**: Include internal links to other pages

## Example Post

```mdx
---
title: "Understanding Technical Analysis Basics"
title_zh: "理解技术分析基础"
date: "2026-01-20"
excerpt: "Learn the fundamentals of technical analysis and how to read market charts effectively."
excerpt_zh: "学习技术分析的基础知识以及如何有效地阅读市场图表。"
category: "blog"
---

## What is Technical Analysis?

Technical analysis is the study of historical price movements...

## Key Concepts

### Support and Resistance

Support levels are price points where...

### Trend Lines

A trend line connects...

## Getting Started

Ready to apply these concepts? Start with our free Telegram bot...
```

## Publishing Workflow

1. **Draft**: Create `.mdx` file with `status: draft` (optional)
2. **Review**: Check content and translations
3. **Publish**: Commit and push to main
4. **Verify**: Check live site at `/blog/[slug]`

## Automatic Features

When you add a post:
- Appears in blog listing page
- Included in sitemap.xml
- Article JSON-LD schema generated
- Reading time calculated
- Date formatting applied

## Troubleshooting

**Post not appearing?**
- Check file is in `content/blog/`
- Verify `.mdx` extension
- Check frontmatter syntax (no trailing commas)
- Ensure date is valid ISO format

**Wrong category showing?**
- Verify category is one of: `blog`, `announcement`, `feature`, `notice`
