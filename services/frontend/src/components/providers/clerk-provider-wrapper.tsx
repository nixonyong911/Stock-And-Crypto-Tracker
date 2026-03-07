"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { ReactNode, useState, useEffect } from "react";

const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

interface Props {
  children: ReactNode;
  locale: string;
}

export function ClerkProviderWrapper({ children, locale }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isClerkConfigured) {
    return <>{children}</>;
  }

  const getStartedUrl = `/${locale}/get-started`;

  return (
    <ClerkProvider
      signInUrl={`/${locale}/sign-in`}
      signUpUrl={`/${locale}/sign-up`}
      signInForceRedirectUrl={getStartedUrl}
      signUpForceRedirectUrl={getStartedUrl}
      appearance={{
        baseTheme: mounted && resolvedTheme === "dark" ? dark : undefined,
      }}
    >
      {children}
    </ClerkProvider>
  );
}
