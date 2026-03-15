import { setRequestLocale } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { COMMANDS } from "@/data/commands";
import { CommandsContent } from "./commands-content";

const baseUrl = "https://stockandcryptotracker.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const title = "Telegram Bot Commands";
  const description =
    "Complete reference for all Stock And Crypto Tracker Telegram bot commands. Learn how to track stocks, manage your watchlist, set up alerts, and more.";

  return {
    title,
    description,
    keywords: [
      "telegram stock tracker bot commands",
      "crypto tracker bot help",
      "stock tracker telegram bot",
      "telegram bot watchlist commands",
      "how to use stock tracker bot",
      "telegram crypto alerts commands",
    ],
    openGraph: {
      title: `${title} | Stock And Crypto Tracker`,
      description,
      url: `${baseUrl}/${locale}/commands`,
      type: "website",
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/commands`,
      languages: {
        en: `${baseUrl}/en/commands`,
        zh: `${baseUrl}/zh/commands`,
      },
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CommandsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: COMMANDS.map((cmd) => ({
      "@type": "Question",
      name: `What does the ${cmd.name} command do?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: cmd.description,
      },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${baseUrl}/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Commands",
        item: `${baseUrl}/${locale}/commands`,
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema),
          }}
        />
        <CommandsContent />
      </main>
      <Footer />
    </div>
  );
}
