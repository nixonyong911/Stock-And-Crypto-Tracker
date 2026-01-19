import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BillingContent } from "./billing-content";
import { getUserByClerkId } from "@/lib/db/users";
import { getSupabaseAdmin } from "@/lib/db/supabase";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function BillingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { userId } = await auth();
  const clerkUser = await currentUser();

  if (!userId || !clerkUser) {
    redirect(`/${locale}/sign-in`);
  }

  // Get database user
  const dbUser = await getUserByClerkId(userId);

  if (!dbUser) {
    redirect(`/${locale}/dashboard`);
  }

  // Get subscription details
  const supabase = getSupabaseAdmin();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", dbUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <BillingContent
          user={dbUser}
          subscription={subscription}
          clerkUser={{
            email: clerkUser.emailAddresses[0]?.emailAddress || "",
          }}
        />
      </main>
      <Footer />
    </div>
  );
}
