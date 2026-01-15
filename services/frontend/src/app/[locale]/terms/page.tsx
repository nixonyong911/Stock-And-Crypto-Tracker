import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Stock And Crypto Tracker",
  description: "Terms of Service for using Stock And Crypto Tracker services.",
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
    <article className="container mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <header className="mb-10 border-b pb-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("lastUpdated")}: January 16, 2026
        </p>
      </header>

      <div className="space-y-8 text-sm leading-relaxed">
        {/* 1. Definitions */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.definitions.title")}
          </h2>
          <p className="mb-3">{t("sections.definitions.intro")}</p>
          <ul className="list-none space-y-2 pl-4">
            <li><strong>&quot;Service&quot;</strong> {t("sections.definitions.service")}</li>
            <li><strong>&quot;User&quot;</strong> {t("sections.definitions.user")}</li>
            <li><strong>&quot;Content&quot;</strong> {t("sections.definitions.content")}</li>
            <li><strong>&quot;Subscription&quot;</strong> {t("sections.definitions.subscription")}</li>
            <li><strong>&quot;Third-Party Data&quot;</strong> {t("sections.definitions.thirdPartyData")}</li>
          </ul>
        </section>

        {/* 2. Acceptance of Terms */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.acceptance.title")}
          </h2>
          <p>{t("sections.acceptance.content")}</p>
        </section>

        {/* 3. Description of Service */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.serviceDescription.title")}
          </h2>
          <p>{t("sections.serviceDescription.content")}</p>
        </section>

        {/* 4. Not Financial Advice */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.notFinancialAdvice.title")}
          </h2>
          <p className="mb-3 font-semibold uppercase">
            {t("sections.notFinancialAdvice.warning")}
          </p>
          <div className="space-y-3">
            <p>{t("sections.notFinancialAdvice.content1")}</p>
            <p>{t("sections.notFinancialAdvice.content2")}</p>
            <p>{t("sections.notFinancialAdvice.content3")}</p>
          </div>
        </section>

        {/* 5. AI-Generated Content Disclaimer */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.aiDisclaimer.title")}
          </h2>
          <p className="mb-3">{t("sections.aiDisclaimer.intro")}</p>
          <div className="space-y-3">
            <p>{t("sections.aiDisclaimer.content1")}</p>
            <p>{t("sections.aiDisclaimer.content2")}</p>
          </div>
        </section>

        {/* 6. Third-Party Data Sources */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.thirdPartyData.title")}
          </h2>
          <p>{t("sections.thirdPartyData.content")}</p>
        </section>

        {/* 7. User Account */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.account.title")}
          </h2>
          <p>{t("sections.account.content")}</p>
        </section>

        {/* 8. Subscription and Payment */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.subscription.title")}
          </h2>
          <div className="space-y-3">
            <p>{t("sections.subscription.content1")}</p>
            <p>{t("sections.subscription.content2")}</p>
            <p>{t("sections.subscription.content3")}</p>
          </div>
        </section>

        {/* 9. User Conduct */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.conduct.title")}
          </h2>
          <p className="mb-3">{t("sections.conduct.intro")}</p>
          <p>{t("sections.conduct.content")}</p>
        </section>

        {/* 10. Intellectual Property */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.intellectualProperty.title")}
          </h2>
          <p>{t("sections.intellectualProperty.content")}</p>
        </section>

        {/* 11. Disclaimer of Warranties - ALL CAPS */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.warranties.title")}
          </h2>
          <p className="uppercase">
            {t("sections.warranties.content")}
          </p>
        </section>

        {/* 12. Limitation of Liability - ALL CAPS */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.liability.title")}
          </h2>
          <p className="uppercase">
            {t("sections.liability.content")}
          </p>
        </section>

        {/* 13. Indemnification */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.indemnification.title")}
          </h2>
          <p>{t("sections.indemnification.content")}</p>
        </section>

        {/* 14. Termination */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.termination.title")}
          </h2>
          <p>{t("sections.termination.content")}</p>
        </section>

        {/* 15. Governing Law and Disputes */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.governingLaw.title")}
          </h2>
          <p>{t("sections.governingLaw.content")}</p>
        </section>

        {/* 16. General Provisions */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.general.title")}
          </h2>
          <p>{t("sections.general.content")}</p>
        </section>

        {/* 17. Changes to Terms */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.changes.title")}
          </h2>
          <p>{t("sections.changes.content")}</p>
        </section>

        {/* 18. Contact Information */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.contact.title")}
          </h2>
          <p>{t("sections.contact.content")}</p>
        </section>
      </div>
    </article>
  );
}
