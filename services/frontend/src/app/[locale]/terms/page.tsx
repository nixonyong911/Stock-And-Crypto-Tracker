import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | Stock And Crypto Tracker",
  description: "Terms and Conditions for using Stock And Crypto Tracker services.",
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <TermsContent />
      </main>
      <Footer />
    </div>
  );
}

function TermsContent() {
  const t = useTranslations("terms");

  return (
    <article className="container mx-auto max-w-4xl px-4 py-16">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("lastUpdated")}: January 16, 2026
        </p>
      </header>

      <div className="prose prose-neutral dark:prose-invert max-w-none">
        {/* Introduction */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.introduction.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.introduction.content")}</p>
        </section>

        {/* NOT Financial Advice - CRITICAL */}
        <section className="mb-10 rounded-lg border-2 border-destructive/50 bg-destructive/5 p-6">
          <h2 className="text-2xl font-semibold mb-4 text-destructive">{t("sections.notFinancialAdvice.title")}</h2>
          <div className="space-y-4 text-muted-foreground">
            <p className="font-semibold text-foreground">{t("sections.notFinancialAdvice.warning")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("sections.notFinancialAdvice.points.noLicense")}</li>
              <li>{t("sections.notFinancialAdvice.points.educational")}</li>
              <li>{t("sections.notFinancialAdvice.points.noRecommendation")}</li>
              <li>{t("sections.notFinancialAdvice.points.consultProfessional")}</li>
              <li>{t("sections.notFinancialAdvice.points.pastPerformance")}</li>
              <li>{t("sections.notFinancialAdvice.points.ownRisk")}</li>
            </ul>
          </div>
        </section>

        {/* AI-Generated Content Disclaimer - CRITICAL */}
        <section className="mb-10 rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-6">
          <h2 className="text-2xl font-semibold mb-4 text-amber-600 dark:text-amber-400">{t("sections.aiDisclaimer.title")}</h2>
          <div className="space-y-4 text-muted-foreground">
            <p>{t("sections.aiDisclaimer.intro")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("sections.aiDisclaimer.points.errors")}</li>
              <li>{t("sections.aiDisclaimer.points.noGuarantee")}</li>
              <li>{t("sections.aiDisclaimer.points.verify")}</li>
              <li>{t("sections.aiDisclaimer.points.historical")}</li>
            </ul>
          </div>
        </section>

        {/* Service Description */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.serviceDescription.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.serviceDescription.content")}</p>
        </section>

        {/* User Eligibility */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.eligibility.title")}</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.eligibility.points.age")}</li>
            <li>{t("sections.eligibility.points.jurisdiction")}</li>
            <li>{t("sections.eligibility.points.compliance")}</li>
          </ul>
        </section>

        {/* Account Registration */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.account.title")}</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.account.points.telegram")}</li>
            <li>{t("sections.account.points.accurate")}</li>
            <li>{t("sections.account.points.security")}</li>
          </ul>
        </section>

        {/* Subscription & Payment */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.subscription.title")}</h2>
          <div className="space-y-4 text-muted-foreground">
            <p>{t("sections.subscription.intro")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("sections.subscription.points.freeTier")}</li>
              <li>{t("sections.subscription.points.proTier")}</li>
              <li>{t("sections.subscription.points.billing")}</li>
              <li>{t("sections.subscription.points.refunds")}</li>
              <li>{t("sections.subscription.points.cancellation")}</li>
            </ul>
          </div>
        </section>

        {/* Limitation of Liability - CRITICAL */}
        <section className="mb-10 rounded-lg border bg-muted/30 p-6">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.liability.title")}</h2>
          <div className="space-y-4 text-muted-foreground">
            <p className="font-semibold text-foreground">{t("sections.liability.warning")}</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>{t("sections.liability.points.noLiability")}</li>
              <li>{t("sections.liability.points.maxLiability")}</li>
              <li>{t("sections.liability.points.asIs")}</li>
              <li>{t("sections.liability.points.noConsequential")}</li>
            </ul>
          </div>
        </section>

        {/* Intellectual Property */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.intellectualProperty.title")}</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.intellectualProperty.points.ownership")}</li>
            <li>{t("sections.intellectualProperty.points.license")}</li>
            <li>{t("sections.intellectualProperty.points.noRedistribution")}</li>
          </ul>
        </section>

        {/* User Conduct */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.conduct.title")}</h2>
          <p className="mb-4 text-muted-foreground">{t("sections.conduct.intro")}</p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.conduct.points.noResale")}</li>
            <li>{t("sections.conduct.points.noAbuse")}</li>
            <li>{t("sections.conduct.points.noIllegal")}</li>
          </ul>
        </section>

        {/* Indemnification */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.indemnification.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.indemnification.content")}</p>
        </section>

        {/* Termination */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.termination.title")}</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.termination.points.rightToTerminate")}</li>
            <li>{t("sections.termination.points.effect")}</li>
            <li>{t("sections.termination.points.survival")}</li>
          </ul>
        </section>

        {/* Governing Law */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.governingLaw.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.governingLaw.content")}</p>
        </section>

        {/* Changes to Terms */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.changes.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.changes.content")}</p>
        </section>

        {/* Contact */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.contact.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.contact.content")}</p>
        </section>
      </div>
    </article>
  );
}
