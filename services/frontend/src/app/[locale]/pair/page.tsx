import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { PairPageContent } from "./pair-content";
import { getUserByClerkId } from "@/lib/db/users";

// Always fetch fresh — pairing state changes often
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PairPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();

  if (!user) {
    // Not logged in — redirect to sign-in, then back here
    redirect(`/${locale}/sign-in?redirect_url=/${locale}/pair`);
  }

  const dbUser = await getUserByClerkId(user.id);
  const isPaired = dbUser?.telegram_user_id !== null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold">Pair Telegram</h1>
            <p className="mt-1 text-muted-foreground">
              Link your Telegram account to start using AI chat
            </p>
          </div>
          <PairPageContent isPaired={isPaired} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
