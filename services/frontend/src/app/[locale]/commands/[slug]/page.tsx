import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import {
  COMMANDS,
  getCommandBySlug,
  getAllCommandSlugs,
} from "@/data/commands";
import { CommandDetail } from "./command-detail";

const baseUrl = "https://stockandcryptotracker.com";

export function generateStaticParams() {
  return getAllCommandSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const command = getCommandBySlug(slug);

  if (!command) {
    return { title: "Command Not Found" };
  }

  const title = `${command.name} Command - ${command.shortDescription}`;
  const description = command.description;

  return {
    title,
    description,
    keywords: [
      `${command.name} telegram bot command`,
      `stock tracker ${command.slug} command`,
      `how to use ${command.name}`,
      "telegram stock tracker bot",
      "crypto tracker bot commands",
    ],
    openGraph: {
      title: `${title} | Stock And Crypto Tracker`,
      description,
      url: `${baseUrl}/${locale}/commands/${slug}`,
      type: "article",
    },
    alternates: {
      canonical: `${baseUrl}/${locale}/commands/${slug}`,
      languages: {
        en: `${baseUrl}/en/commands/${slug}`,
        zh: `${baseUrl}/zh/commands/${slug}`,
      },
    },
  };
}

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function CommandPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const command = getCommandBySlug(slug);
  if (!command) {
    notFound();
  }

  const currentIndex = COMMANDS.findIndex((c) => c.slug === slug);
  const prevCommand = currentIndex > 0 ? COMMANDS[currentIndex - 1] : null;
  const nextCommand =
    currentIndex < COMMANDS.length - 1 ? COMMANDS[currentIndex + 1] : null;

  const howToSteps = [
    ...(command.requiresPairing
      ? [
          {
            "@type": "HowToStep" as const,
            name: "Pair your account",
            text: "Link your Telegram to your web account at stockandcryptotracker.com/pair using /pair <code>.",
            position: 1,
          },
        ]
      : []),
    ...(command.requiresSession
      ? [
          {
            "@type": "HowToStep" as const,
            name: "Log in",
            text: "Start a session with /login to activate the bot.",
            position: command.requiresPairing ? 2 : 1,
          },
        ]
      : []),
    {
      "@type": "HowToStep" as const,
      name: `Use ${command.name}`,
      text: `Type ${command.syntax} in the Telegram chat. ${command.description}`,
      position:
        (command.requiresPairing ? 1 : 0) +
        (command.requiresSession ? 1 : 0) +
        1,
    },
  ];

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to use ${command.name} in Stock And Crypto Tracker`,
    description: command.description,
    step: howToSteps,
    totalTime: "PT1M",
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
      {
        "@type": "ListItem",
        position: 3,
        name: command.name,
        item: `${baseUrl}/${locale}/commands/${slug}`,
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
            __html: JSON.stringify(howToSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema),
          }}
        />
        <CommandDetail
          command={command}
          prevCommand={
            prevCommand
              ? { slug: prevCommand.slug, name: prevCommand.name }
              : null
          }
          nextCommand={
            nextCommand
              ? { slug: nextCommand.slug, name: nextCommand.name }
              : null
          }
        />
      </main>
      <Footer />
    </div>
  );
}
