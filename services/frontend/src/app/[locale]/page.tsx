import { setRequestLocale, getTranslations } from "next-intl/server";
import { Metadata } from "next";
import { Header, Footer } from "@/components/layout";
import { buildAlternates } from "@/lib/seo/alternates";
import {
  NewHeroSection,
  DiffSection,
  ProofSection,
  NewTestimonialsSection,
  AnatomySection,
  NewHowItWorksSection,
  NewPricingSection,
  SecuritySection,
  FounderSection,
  HomeFaqSection,
  NewFinalCtaSection,
  RevealProvider,
} from "@/components/sections/home";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: buildAlternates("", locale),
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Header />
      <main className="flex-1">
        <NewHeroSection />
        <DiffSection />
        <ProofSection />
        <NewTestimonialsSection />
        <AnatomySection />
        <NewHowItWorksSection />
        <NewPricingSection />
        <SecuritySection />
        <FounderSection />
        <HomeFaqSection />
        <NewFinalCtaSection />
      </main>
      <Footer />
      <RevealProvider />
    </div>
  );
}
