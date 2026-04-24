"use client";

import { useAuth } from "@clerk/nextjs";
import { Link } from "@/lib/i18n/routing";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot?start=register";
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

interface SmartCtaLinkProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  fallbackHref?: string;
}

/**
 * CTA link that routes based on auth state:
 * - Not signed in → /sign-up
 * - Signed in → Telegram bot
 * - Clerk not configured → fallbackHref (default /pricing)
 */
export function SmartCtaLink({
  children,
  className,
  style,
  fallbackHref = "/pricing",
}: SmartCtaLinkProps) {
  if (!isClerkConfigured) {
    return (
      <Link href={fallbackHref} className={className} style={style}>
        {children}
      </Link>
    );
  }

  return <AuthAwareLink className={className} style={style} fallbackHref={fallbackHref}>{children}</AuthAwareLink>;
}

function AuthAwareLink({
  children,
  className,
  style,
  fallbackHref,
}: SmartCtaLinkProps) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <Link href={fallbackHref!} className={className} style={style}>
        {children}
      </Link>
    );
  }

  if (isSignedIn) {
    return (
      <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {children}
      </a>
    );
  }

  return (
    <Link href="/sign-up" className={className} style={style}>
      {children}
    </Link>
  );
}
