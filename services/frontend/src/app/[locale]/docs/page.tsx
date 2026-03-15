import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { COMMANDS } from "@/data/commands";
import { Metadata } from "next";

const baseUrl = "https://stockandcryptotracker.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const title = "Documentation";
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
      url: `${baseUrl}/${locale}/docs`,
      type: "website",
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/docs`,
      languages: {
        en: `${baseUrl}/en/docs`,
        zh: `${baseUrl}/zh/docs`,
      },
    },
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DocsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const firstSlug = COMMANDS[0]?.slug ?? "start";
  redirect(`/${locale}/docs/commands/${firstSlug}`);
}
