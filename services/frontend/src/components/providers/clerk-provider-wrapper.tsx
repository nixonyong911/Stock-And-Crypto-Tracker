"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function ClerkProviderWrapper({ children }: Props) {
  // Only wrap with ClerkProvider if the key is available
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }

  return <ClerkProvider>{children}</ClerkProvider>;
}
