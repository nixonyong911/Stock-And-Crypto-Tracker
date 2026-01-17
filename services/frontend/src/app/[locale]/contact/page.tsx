import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { Metadata } from "next";
import { ContactForm } from "./contact-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "contact stock tracker",
      "crypto tracker support",
      "customer service",
      "get in touch",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
  };
}

// JSON-LD ContactPage schema
const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Us - Stock And Crypto Tracker",
  description: "Get in touch with Stock And Crypto Tracker team",
  url: "https://stockandcryptotracker.com/contact",
  mainEntity: {
    "@type": "Organization",
    name: "Stock And Crypto Tracker",
    email: "contact@stockandcryptotracker.com",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: "contact@stockandcryptotracker.com",
      availableLanguage: ["English", "Chinese"],
      areaServed: "Worldwide",
    },
  },
};

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(contactPageSchema),
          }}
        />
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}
