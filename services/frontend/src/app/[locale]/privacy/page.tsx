import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Stock And Crypto Tracker",
  description: "Privacy Policy for Stock And Crypto Tracker - How we collect, use, and protect your data.",
};

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

        {/* Data We Collect */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.dataCollected.title")}</h2>
          <p className="mb-4 text-muted-foreground">{t("sections.dataCollected.intro")}</p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.dataCollected.points.email")}</li>
            <li>{t("sections.dataCollected.points.telegramId")}</li>
            <li>{t("sections.dataCollected.points.usage")}</li>
            <li>{t("sections.dataCollected.points.payment")}</li>
          </ul>
        </section>

        {/* How We Use Your Data */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.dataUsage.title")}</h2>
          <p className="mb-4 text-muted-foreground">{t("sections.dataUsage.intro")}</p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.dataUsage.points.service")}</li>
            <li>{t("sections.dataUsage.points.communication")}</li>
            <li>{t("sections.dataUsage.points.improvement")}</li>
            <li>{t("sections.dataUsage.points.billing")}</li>
          </ul>
        </section>

        {/* Third-Party Services */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.thirdParty.title")}</h2>
          <p className="mb-4 text-muted-foreground">{t("sections.thirdParty.intro")}</p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.thirdParty.points.stripe")}</li>
            <li>{t("sections.thirdParty.points.telegram")}</li>
            <li>{t("sections.thirdParty.points.vercel")}</li>
          </ul>
        </section>

        {/* Data Security */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.security.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.security.content")}</p>
        </section>

        {/* Data Retention */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.retention.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.retention.content")}</p>
        </section>

        {/* Your Rights (GDPR) */}
        <section className="mb-10 rounded-lg border bg-muted/30 p-6">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.rights.title")}</h2>
          <p className="mb-4 text-muted-foreground">{t("sections.rights.intro")}</p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>{t("sections.rights.points.access")}</li>
            <li>{t("sections.rights.points.rectification")}</li>
            <li>{t("sections.rights.points.erasure")}</li>
            <li>{t("sections.rights.points.portability")}</li>
            <li>{t("sections.rights.points.objection")}</li>
          </ul>
          <p className="mt-4 text-muted-foreground">{t("sections.rights.howToExercise")}</p>
        </section>

        {/* Cookies */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.cookies.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.cookies.content")}</p>
        </section>

        {/* International Transfers */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.internationalTransfers.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.internationalTransfers.content")}</p>
        </section>

        {/* Children's Privacy */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4">{t("sections.children.title")}</h2>
          <p className="text-muted-foreground leading-relaxed">{t("sections.children.content")}</p>
        </section>

        {/* Changes to Policy */}
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
