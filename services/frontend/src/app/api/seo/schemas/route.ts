import { NextResponse } from "next/server";

const baseUrl = "https://stockandcryptotracker.com";

export async function GET() {
  const report = {
    checkedAt: new Date().toISOString(),
    site: baseUrl,
    schemas: [
      {
        type: "WebSite",
        location: "Global (all pages via layout)",
        fields: [
          "name",
          "url",
          "description",
          "inLanguage",
          "publisher",
          "potentialAction (SearchAction)",
        ],
      },
      {
        type: "Organization",
        location: "Global (all pages via layout)",
        fields: ["name", "url", "logo", "contactPoint", "sameAs"],
      },
      {
        type: "SoftwareApplication",
        location: "Global (all pages via layout)",
        fields: [
          "name",
          "applicationCategory",
          "operatingSystem",
          "offers",
          "aggregateRating",
        ],
      },
      {
        type: "HowTo",
        location: "Global (all pages via layout)",
        fields: ["name", "description", "step[]"],
      },
      {
        type: "SpeakableSpecification",
        location: "Global (all pages via layout)",
        fields: ["cssSelector"],
      },
      {
        type: "FAQPage",
        location: "/en/faq and /en/ticker/[symbol]",
        fields: ["mainEntity[].Question", "mainEntity[].acceptedAnswer"],
      },
      {
        type: "FinancialProduct",
        location: "/en/ticker/[symbol]",
        fields: ["name", "description", "provider", "offers"],
      },
      {
        type: "BreadcrumbList",
        location:
          "/en/pricing, /en/faq, /en/blog, /en/blog/[slug], /en/ticker/[symbol]",
        fields: ["itemListElement[].name", "itemListElement[].item"],
      },
      {
        type: "Article",
        location: "/en/blog/[slug]",
        fields: [
          "headline",
          "description",
          "datePublished",
          "dateModified",
          "author",
          "publisher",
          "image",
          "inLanguage",
        ],
      },
    ],
    validationTools: [
      "https://search.google.com/test/rich-results",
      "https://validator.schema.org/",
      "https://www.bing.com/webmasters/markup-validator",
    ],
  };

  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
