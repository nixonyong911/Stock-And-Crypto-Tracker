import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { buildAlternates } from "@/lib/seo/alternates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Privacy Policy",
    description:
      "Privacy Policy for Stock And Crypto Tracker - How we collect, use, and protect your data.",
    alternates: buildAlternates("/privacy", locale),
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <PrivacyContent />
      </main>
      <Footer />
    </div>
  );
}

function PrivacyContent() {
  const t = useTranslations("privacy");

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
        {/* 1. Introduction */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.introduction.title")}
          </h2>
          <p>{t("sections.introduction.content")}</p>
        </section>

        {/* 2. Definitions */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.definitions.title")}
          </h2>
          <p className="mb-3">{t("sections.definitions.intro")}</p>
          <ul className="list-none space-y-2 pl-4">
            <li><strong>&quot;Personal Data&quot;</strong> {t("sections.definitions.personalData")}</li>
            <li><strong>&quot;Processing&quot;</strong> {t("sections.definitions.processing")}</li>
            <li><strong>&quot;Data Controller&quot;</strong> {t("sections.definitions.dataController")}</li>
          </ul>
        </section>

        {/* 3. Information We Collect */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.dataCollected.title")}
          </h2>
          <p className="mb-3">{t("sections.dataCollected.intro")}</p>
          <p>{t("sections.dataCollected.content")}</p>
        </section>

        {/* 4. How We Use Your Information */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.dataUsage.title")}
          </h2>
          <p className="mb-3">{t("sections.dataUsage.intro")}</p>
          <p>{t("sections.dataUsage.content")}</p>
        </section>

        {/* 5. Legal Basis for Processing */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.legalBasis.title")}
          </h2>
          <p>{t("sections.legalBasis.content")}</p>
        </section>

        {/* 6. Third-Party Service Providers */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.thirdParty.title")}
          </h2>
          <p className="mb-3">{t("sections.thirdParty.intro")}</p>
          <p>{t("sections.thirdParty.content")}</p>
        </section>

        {/* 7. Data Security */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.security.title")}
          </h2>
          <p>{t("sections.security.content")}</p>
        </section>

        {/* 8. Data Retention */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.retention.title")}
          </h2>
          <p>{t("sections.retention.content")}</p>
        </section>

        {/* 9. Your Rights */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.rights.title")}
          </h2>
          <p className="mb-3">{t("sections.rights.intro")}</p>
          <p>{t("sections.rights.content")}</p>
        </section>

        {/* 10. International Data Transfers */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.internationalTransfers.title")}
          </h2>
          <p>{t("sections.internationalTransfers.content")}</p>
        </section>

        {/* 11. Cookies and Tracking */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.cookies.title")}
          </h2>
          <p>{t("sections.cookies.content")}</p>
        </section>

        {/* 12. Children's Privacy */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.children.title")}
          </h2>
          <p>{t("sections.children.content")}</p>
        </section>

        {/* 13. Changes to This Policy */}
        <section>
          <h2 className="mb-3 text-base font-bold uppercase">
            {t("sections.changes.title")}
          </h2>
          <p>{t("sections.changes.content")}</p>
        </section>

        {/* 14. Contact Us */}
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
