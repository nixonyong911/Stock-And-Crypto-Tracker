import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Header, Footer } from "@/components/layout";
import { ensureUserExists } from "@/lib/db/users";
import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminPage({ params }: Props) {
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

  // Only dev tier can access admin
  if (dbUser.tier !== "dev") {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <AdminDashboard />
      </main>
      <Footer />
    </div>
  );
}
