"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { ReactNode, useState, useEffect } from "react";

// Check if Clerk is configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

interface Props {
  children: ReactNode;
}

// Use this wrapper inside ThemeProvider to access theme context
export function ClerkProviderWrapper({ children }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isClerkConfigured) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      appearance={{
        // Only apply theme after mounted to avoid hydration mismatch
        baseTheme: mounted && resolvedTheme === "dark" ? dark : undefined,
      }}
    >
      {children}
    </ClerkProvider>
  );
}
