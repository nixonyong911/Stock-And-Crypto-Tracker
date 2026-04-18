import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { buildAlternates } from "@/lib/seo/alternates";
import { BreadcrumbJsonLd, ArticleJsonLd } from "@/components/seo";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { notFound } from "next/navigation";
import {
  getPostBySlug,
  getAllPostSlugs,
  formatDate,
  getCategoryName,
} from "@/lib/blog";
import { Link } from "@/lib/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import { locales } from "@/lib/i18n/config";

// Generate static params for all posts and locales
export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return locales.flatMap((locale) =>
    slugs.map((slug) => ({
      locale,
      slug,
    }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found",
    };
  }

  const title = locale === "zh" && post.title_zh ? post.title_zh : post.title;
  const description =
    locale === "zh" && post.excerpt_zh ? post.excerpt_zh : post.excerpt;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.date,
      authors: ["Stock And Crypto Tracker"],
    },
    alternates: buildAlternates(`/blog/${slug}`, locale),
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "blogPage" });
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const title = locale === "zh" && post.title_zh ? post.title_zh : post.title;
  const content = locale === "zh" && post.content_zh ? post.content_zh : post.content;

  const description =
    locale === "zh" && post.excerpt_zh ? post.excerpt_zh : post.excerpt;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BreadcrumbJsonLd
          locale={locale}
          items={[
            { name: "Home", path: "" },
            { name: t("title"), path: "/blog" },
            { name: title },
          ]}
        />
        <ArticleJsonLd
          locale={locale}
          title={title}
          description={description}
          slug={slug}
          datePublished={post.date}
        />

        <article className="py-12">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl">
              <Breadcrumbs
                items={[
                  { label: "Home", href: "/" },
                  { label: t("title"), href: "/blog" },
                  { label: title },
                ]}
              />

              {/* Post Header */}
              <header className="mb-8">
                <Badge variant="secondary" className="mb-4">
                  {getCategoryName(post.category, locale)}
                </Badge>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {title}
                </h1>
                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(post.date, locale)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {post.readingTime} {t("minRead")}
                  </span>
                </div>
              </header>

              {/* Post Content */}
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                {/* For now, render as plain text. In production, use MDX compiler */}
                {content.split("\n").map((paragraph, index) => {
                  if (paragraph.startsWith("# ")) {
                    return (
                      <h2 key={index} className="text-2xl font-bold mt-8 mb-4">
                        {paragraph.replace("# ", "")}
                      </h2>
                    );
                  }
                  if (paragraph.startsWith("## ")) {
                    return (
                      <h2 key={index} className="text-xl font-bold mt-6 mb-3">
                        {paragraph.replace("## ", "")}
                      </h2>
                    );
                  }
                  if (paragraph.startsWith("### ")) {
                    return (
                      <h3 key={index} className="text-lg font-bold mt-4 mb-2">
                        {paragraph.replace("### ", "")}
                      </h3>
                    );
                  }
                  if (paragraph.startsWith("- ")) {
                    return (
                      <li key={index} className="ml-4">
                        {paragraph.replace("- ", "")}
                      </li>
                    );
                  }
                  if (paragraph.trim() === "") {
                    return null;
                  }
                  return (
                    <p key={index} className="mb-4 text-muted-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  );
                })}
              </div>

              {/* Post Footer */}
              <footer className="mt-12 border-t pt-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button asChild variant="outline">
                    <Link href="/blog">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {t("backToList")}
                    </Link>
                  </Button>
                  <Button asChild>
                    <a
                      href="https://t.me/StockAndCryptoAdvisorBot?start=register"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("tryBot")}
                    </a>
                  </Button>
                </div>
              </footer>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
