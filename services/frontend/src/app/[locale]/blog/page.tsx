import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { buildAlternates } from "@/lib/seo/alternates";
import { BreadcrumbJsonLd } from "@/components/seo";
import { getAllPosts, formatDate, getCategoryName } from "@/lib/blog";
import { Link } from "@/lib/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Calendar } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blogPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "stock market blog",
      "crypto news",
      "market analysis articles",
      "trading insights",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
    alternates: buildAlternates("/blog", locale),
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "blogPage" });
  const posts = await getAllPosts();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BreadcrumbJsonLd
          locale={locale}
          items={[
            { name: "Home", path: "" },
            { name: t("hero.title") },
          ]}
        />
        <section className="border-b bg-muted/30 py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              {t("hero.subtitle")}
            </p>
          </div>
        </section>

        {/* Blog Posts */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-4xl">
              {posts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">{t("noPosts")}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {posts.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="block"
                    >
                      <Card className="transition-colors hover:border-primary">
                        <CardHeader>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary">
                              {getCategoryName(post.category, locale)}
                            </Badge>
                          </div>
                          <CardTitle className="text-xl">
                            {locale === "zh" && post.title_zh
                              ? post.title_zh
                              : post.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground mb-4">
                            {locale === "zh" && post.excerpt_zh
                              ? post.excerpt_zh
                              : post.excerpt}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(post.date, locale)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {post.readingTime} {t("minRead")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
