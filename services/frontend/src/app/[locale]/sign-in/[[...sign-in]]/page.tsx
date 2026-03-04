import { SignIn } from "@clerk/nextjs";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

// Check if Clerk is configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function SignInPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Redirect to home if Clerk is not configured
  if (!isClerkConfigured) {
    redirect(`/${locale}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        forceRedirectUrl={`/${locale}/get-started`}
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
      />
    </div>
  );
}
