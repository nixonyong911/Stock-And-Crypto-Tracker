import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { buildAlternates } from "@/lib/seo/alternates";
import { BreadcrumbJsonLd } from "@/components/seo";
import { FaqContent } from "./faq-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "faqPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "stock tracker FAQ",
      "crypto tracker questions",
      "AI market analysis help",
      "frequently asked questions",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
    alternates: buildAlternates("/faq", locale),
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "faqPage" });

  // Build FAQ schema dynamically from translations
  const faqCategories = ["general", "pricing", "technical", "account", "affiliate"] as const;
  const faqItems: { question: string; answer: string }[] = [];

  const questionsCounts: Record<string, number> = {
    general: 4,
    pricing: 6,
    technical: 4,
    account: 3,
    affiliate: 2,
  };

  faqCategories.forEach((category) => {
    const questionsCount = questionsCounts[category];

    for (let i = 1; i <= questionsCount; i++) {
      faqItems.push({
        question: t(`categories.${category}.questions.q${i}.question`),
        answer: t(`categories.${category}.questions.q${i}.answer`),
      });
    }
  });

  // FAQPage JSON-LD schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BreadcrumbJsonLd
          locale={locale}
          items={[
            { name: "Home", path: "" },
            { name: "FAQ" },
          ]}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqSchema),
          }}
        />
        <FaqContent />
      </main>
      <Footer />
    </div>
  );
}
