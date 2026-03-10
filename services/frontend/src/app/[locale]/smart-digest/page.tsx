import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { SmartDigestContent } from "./smart-digest-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "smartDigestPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "smart digest",
      "AI stock analysis",
      "watchlist alerts",
      "multi-timeframe analysis",
      "stock signals",
      "crypto signals",
      "telegram alerts",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SmartDigestPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <SmartDigestContent />
      </main>
      <Footer />
    </div>
  );
}
