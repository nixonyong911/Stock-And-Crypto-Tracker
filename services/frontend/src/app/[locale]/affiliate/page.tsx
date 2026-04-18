import { currentUser } from "@clerk/nextjs/server";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { AffiliateContent } from "./affiliate-content";
import { ensureUserExists } from "@/lib/db/users";
import { Metadata } from "next";
import { buildAlternates } from "@/lib/seo/alternates";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "affiliate" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    keywords: [
      "affiliate program",
      "stock tracker referral",
      "earn commissions",
      "crypto tracker affiliate",
    ],
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
    },
    alternates: buildAlternates("/affiliate", locale),
  };
}

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AffiliatePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();
  let userProps: { id: number; phoneVerified: boolean; telegramLinked: boolean } | null = null;

  if (user) {
    const dbUser = await ensureUserExists({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
    });
    userProps = {
      id: dbUser.id,
      phoneVerified: !!dbUser.phone_hash,
      telegramLinked: dbUser.telegram_user_id !== null,
    };
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <AffiliateContent user={userProps} />
      </main>
      <Footer />
    </div>
  );
}
