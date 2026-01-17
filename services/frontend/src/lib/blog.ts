import fs from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPost {
  slug: string;
  title: string;
  title_zh?: string;
  date: string;
  excerpt: string;
  excerpt_zh?: string;
  category: "blog" | "announcement" | "feature" | "notice";
  content: string;
  content_zh?: string;
  readingTime: number;
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  title_zh?: string;
  date: string;
  excerpt: string;
  excerpt_zh?: string;
  category: "blog" | "announcement" | "feature" | "notice";
  readingTime: number;
}

// Calculate reading time (words per minute)
function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

// Get all blog posts (metadata only)
export async function getAllPosts(): Promise<BlogPostMeta[]> {
  // Check if blog directory exists
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR);
  const mdxFiles = files.filter((file) => file.endsWith(".mdx"));

  const posts = mdxFiles.map((filename) => {
    const slug = filename.replace(".mdx", "");
    const filePath = path.join(BLOG_DIR, filename);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(fileContent);

    return {
      slug,
      title: data.title || slug,
      title_zh: data.title_zh,
      date: data.date || new Date().toISOString(),
      excerpt: data.excerpt || "",
      excerpt_zh: data.excerpt_zh,
      category: data.category || "blog",
      readingTime: calculateReadingTime(content),
    } as BlogPostMeta;
  });

  // Sort by date (newest first)
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// Get a single blog post by slug
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);

  return {
    slug,
    title: data.title || slug,
    title_zh: data.title_zh,
    date: data.date || new Date().toISOString(),
    excerpt: data.excerpt || "",
    excerpt_zh: data.excerpt_zh,
    category: data.category || "blog",
    content,
    content_zh: data.content_zh,
    readingTime: calculateReadingTime(content),
  };
}

// Get all post slugs (for static generation)
export async function getAllPostSlugs(): Promise<string[]> {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR);
  return files
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(".mdx", ""));
}

// Get posts by category
export async function getPostsByCategory(
  category: BlogPost["category"]
): Promise<BlogPostMeta[]> {
  const allPosts = await getAllPosts();
  return allPosts.filter((post) => post.category === category);
}

// Format date for display
export function formatDate(dateString: string, locale: string = "en"): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Get category display name
export function getCategoryName(
  category: BlogPost["category"],
  locale: string = "en"
): string {
  const names: Record<BlogPost["category"], { en: string; zh: string }> = {
    blog: { en: "Blog", zh: "博客" },
    announcement: { en: "Announcement", zh: "公告" },
    feature: { en: "New Feature", zh: "新功能" },
    notice: { en: "Notice", zh: "通知" },
  };
  return names[category][locale as "en" | "zh"] || names[category].en;
}
