const baseUrl = "https://stockandcryptotracker.com";

export type BreadcrumbItem = {
  name: string;
  path?: string;
};

export function BreadcrumbJsonLd({
  locale,
  items,
}: {
  locale: string;
  items: BreadcrumbItem[];
}) {
  const itemListElement = items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    ...(item.path
      ? { item: `${baseUrl}/${locale}${item.path}` }
      : {}),
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function ArticleJsonLd({
  locale,
  title,
  description,
  slug,
  datePublished,
  dateModified,
}: {
  locale: string;
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url: `${baseUrl}/${locale}/blog/${slug}`,
    datePublished,
    dateModified: dateModified ?? datePublished,
    author: {
      "@type": "Organization",
      name: "Stock And Crypto Tracker",
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Stock And Crypto Tracker",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${baseUrl}/${locale}/blog/${slug}`,
    },
    image: `${baseUrl}/og`,
    inLanguage: locale === "zh" ? "zh-Hans" : "en",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
