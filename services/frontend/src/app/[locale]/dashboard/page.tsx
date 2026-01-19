import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { DashboardContent } from "./dashboard-content";
import { getUserByClerkId } from "@/lib/db/users";

// Disable caching - always fetch fresh user data
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();

  if (!user) {
    redirect(`/${locale}/sign-in`);
  }

  // Get user from database
  const dbUser = await getUserByClerkId(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <DashboardContent
          clerkUser={{
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.emailAddresses[0]?.emailAddress,
            imageUrl: user.imageUrl,
          }}
          dbUser={
            dbUser
              ? {
                  id: dbUser.id,
                  tier: dbUser.tier,
                  telegramLinked: dbUser.telegram_user_id !== null,
                }
              : null
          }
        />
      </main>
      <Footer />
    </div>
  );
}
