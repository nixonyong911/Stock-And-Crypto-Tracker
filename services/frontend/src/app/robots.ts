import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://stockandcryptotracker.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/_next/",
          "/checkout/",
          "/sign-in",
          "/sign-up",
          "/dashboard",
          "/get-started",
        ],
      },
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-Web",
          "PerplexityBot",
          "Google-Extended",
          "Applebot-Extended",
        ],
        allow: "/",
        disallow: ["/api/", "/dashboard", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
