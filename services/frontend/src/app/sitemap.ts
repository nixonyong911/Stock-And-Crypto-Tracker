import { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { getAllCommandSlugs } from "@/data/commands";

const baseUrl = "https://stockandcryptotracker.com";
const locales = ["en", "zh"] as const;

type AlternateLanguages = Record<string, string>;

function buildAlternates(path: string): { languages: AlternateLanguages } {
  const languages: AlternateLanguages = {};
  for (const locale of locales) {
    languages[locale] = `${baseUrl}/${locale}${path}`;
  }
  languages["x-default"] = `${baseUrl}/en${path}`;
  return { languages };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

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
    { path: "/smart-digest", changeFrequency: "weekly", priority: 0.8 },
    { path: "/indicators", changeFrequency: "weekly", priority: 0.7 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  ];

  const staticEntries: MetadataRoute.Sitemap = routes.flatMap((route) =>
    locales.map((locale) => ({
      url: `${baseUrl}/${locale}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: buildAlternates(route.path),
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
        alternates: buildAlternates(`/blog/${post.slug}`),
      }))
    );
  } catch {
    // Blog posts unavailable at sitemap generation time
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
        alternates: buildAlternates(`/docs/commands/${slug}`),
      }))
    );
  } catch {
    // Command slugs unavailable at sitemap generation time
  }

  return [...staticEntries, ...blogEntries, ...commandEntries];
}
