import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ensureUserExists } from "@/lib/db/users";
import { GetStartedContent } from "./get-started-content";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function GetStartedPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  const dbUser = await ensureUserExists({
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
  });

  if (dbUser.telegram_user_id !== null) {
    redirect(`/${locale}/dashboard`);
  }

  return <GetStartedContent locale={locale} />;
}
