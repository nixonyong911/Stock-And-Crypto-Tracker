import { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getAllCommandSlugs } from "@/data/commands";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://stockandcryptotracker.com";
  const locales = ["en", "zh"];
  const lastModified = new Date();

  // Static routes with their priorities and change frequencies
  const routes: {
    path: string;
    changeFrequency: "daily" | "weekly" | "monthly";
    priority: number;
  }[] = [
    { path: "", changeFrequency: "daily", priority: 1.0 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
    { path: "/about", changeFrequency: "monthly", priority: 0.7 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
    { path: "/faq", changeFrequency: "weekly", priority: 0.8 },
    { path: "/blog", changeFrequency: "daily", priority: 0.8 },
    { path: "/docs", changeFrequency: "weekly", priority: 0.8 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  ];

  // Generate sitemap entries for static routes
  const staticEntries: MetadataRoute.Sitemap = routes.flatMap((route) =>
    locales.map((locale) => ({
      url: `${baseUrl}/${locale}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    }))
  );

  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const posts = await getAllPosts();
    blogEntries = posts.flatMap((post) =>
      locales.map((locale) => ({
        url: `${baseUrl}/${locale}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
    );
  } catch {
    // Blog posts unavailable at sitemap generation time — skip gracefully
  }

  let commandEntries: MetadataRoute.Sitemap = [];
  try {
    const commandSlugs = getAllCommandSlugs();
    commandEntries = commandSlugs.flatMap((slug) =>
      locales.map((locale) => ({
        url: `${baseUrl}/${locale}/docs/commands/${slug}`,
        lastModified,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }))
    );
  } catch {
    // Command slugs unavailable at sitemap generation time — skip gracefully
  }

  return [...staticEntries, ...blogEntries, ...commandEntries];
}
