"use client";

import { Link } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

// Check if Clerk is configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

interface SignInButtonProps {
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function SignInButton({ className, size = "default" }: SignInButtonProps) {
  // Don't render if Clerk is not configured
  if (!isClerkConfigured) {
    return null;
  }

  const sizeClasses = {
    sm: "text-sm",
    default: "text-base",
    lg: "text-lg",
  };

  return (
    <Link
      href="/sign-in"
      className={cn(
        "inline-flex items-center font-medium text-muted-foreground hover:text-foreground transition-colors",
        sizeClasses[size],
        className
      )}
    >
      Sign in
      <ChevronRight className="h-4 w-4 ml-0.5" />
    </Link>
  );
}
