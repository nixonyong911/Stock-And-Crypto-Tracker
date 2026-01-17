import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { AboutContent } from "./about-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aboutPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "about stock tracker",
      "crypto tracker company",
      "AI market analysis",
      "who we are",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

// JSON-LD AboutPage schema
const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Us - Stock And Crypto Tracker",
  description:
    "Learn about Stock And Crypto Tracker - AI-powered market analysis for stocks and crypto",
  url: "https://stockandcryptotracker.com/about",
  mainEntity: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
    description:
      "AI-powered market analysis for stocks and crypto. Get clear signals without the noise, delivered directly to Telegram.",
    foundingDate: "2025",
    knowsAbout: [
      "Stock Market Analysis",
      "Cryptocurrency Trading",
      "Technical Analysis",
      "AI-powered Financial Analysis",
    ],
  },
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(aboutPageSchema),
          }}
        />
        <AboutContent />
      </main>
      <Footer />
    </div>
  );
}
