import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/blog";
import { getAllCommandSlugs } from "@/data/commands";

const baseUrl = "https://stockandcryptotracker.com";

export async function GET() {
  const checks: {
    name: string;
    status: "ok" | "warn" | "error";
    detail: string;
  }[] = [];

  try {
    const robotsRes = await fetch(`${baseUrl}/robots.txt`, {
      next: { revalidate: 0 },
    });
    checks.push({
      name: "robots.txt",
      status: robotsRes.ok ? "ok" : "error",
      detail: robotsRes.ok
        ? `HTTP ${robotsRes.status}`
        : `HTTP ${robotsRes.status} — robots.txt unreachable`,
    });
  } catch (e) {
    checks.push({
      name: "robots.txt",
      status: "error",
      detail: `Fetch failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
  }

  try {
    const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`, {
      next: { revalidate: 0 },
    });
    const sitemapText = sitemapRes.ok ? await sitemapRes.text() : "";
    const urlCount = (sitemapText.match(/<url>/g) ?? []).length;
    checks.push({
      name: "sitemap.xml",
      status: sitemapRes.ok ? "ok" : "error",
      detail: sitemapRes.ok
        ? `HTTP ${sitemapRes.status} — ${urlCount} URLs`
        : `HTTP ${sitemapRes.status}`,
    });
    if (urlCount === 0 && sitemapRes.ok) {
      checks.push({
        name: "sitemap.url_count",
        status: "warn",
        detail: "Sitemap returned 0 URLs — may indicate a build issue",
      });
    }
  } catch (e) {
    checks.push({
      name: "sitemap.xml",
      status: "error",
      detail: `Fetch failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
  }

  try {
    const llmsRes = await fetch(`${baseUrl}/llms.txt`, {
      next: { revalidate: 0 },
    });
    checks.push({
      name: "llms.txt",
      status: llmsRes.ok ? "ok" : "warn",
      detail: llmsRes.ok
        ? `HTTP ${llmsRes.status}`
        : `HTTP ${llmsRes.status} — AI crawlers won't find product summary`,
    });
  } catch {
    checks.push({
      name: "llms.txt",
      status: "warn",
      detail: "Fetch failed",
    });
  }

  try {
    const ogRes = await fetch(`${baseUrl}/og`, {
      next: { revalidate: 0 },
    });
    checks.push({
      name: "og_image",
      status: ogRes.ok ? "ok" : "error",
      detail: ogRes.ok
        ? `HTTP ${ogRes.status} — content-type: ${ogRes.headers.get("content-type")}`
        : `HTTP ${ogRes.status}`,
    });
  } catch {
    checks.push({
      name: "og_image",
      status: "error",
      detail: "Fetch failed",
    });
  }

  try {
    const indexRes = await fetch(
      `${baseUrl}/d41864d7353d4b0781f94fc09d9ba8c0.txt`,
      { next: { revalidate: 0 } }
    );
    checks.push({
      name: "indexnow_key",
      status: indexRes.ok ? "ok" : "warn",
      detail: indexRes.ok
        ? `HTTP ${indexRes.status}`
        : `HTTP ${indexRes.status} — IndexNow won't accept pushes`,
    });
  } catch {
    checks.push({
      name: "indexnow_key",
      status: "warn",
      detail: "Fetch failed",
    });
  }

  let blogCount = 0;
  try {
    const posts = await getAllPosts();
    blogCount = posts.length;
    checks.push({
      name: "blog_posts",
      status: blogCount > 0 ? "ok" : "warn",
      detail: `${blogCount} posts found`,
    });
  } catch {
    checks.push({
      name: "blog_posts",
      status: "warn",
      detail: "Could not read blog posts",
    });
  }

  let commandCount = 0;
  try {
    const slugs = getAllCommandSlugs();
    commandCount = slugs.length;
    checks.push({
      name: "command_docs",
      status: commandCount > 0 ? "ok" : "warn",
      detail: `${commandCount} command pages found`,
    });
  } catch {
    checks.push({
      name: "command_docs",
      status: "warn",
      detail: "Could not read command docs",
    });
  }

  const errorCount = checks.filter((c) => c.status === "error").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      overall: errorCount > 0 ? "unhealthy" : warnCount > 0 ? "degraded" : "healthy",
      summary: {
        total: checks.length,
        ok: checks.filter((c) => c.status === "ok").length,
        warn: warnCount,
        error: errorCount,
      },
      checks,
      content: {
        blogPosts: blogCount,
        commandDocs: commandCount,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
