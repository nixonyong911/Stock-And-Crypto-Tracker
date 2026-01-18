"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Send, LogIn } from "lucide-react";
import Image from "next/image";

// Check if Clerk is configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot?start=register";

export function Header() {
  const t = useTranslations("nav");
  const tHero = useTranslations("hero");

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-1.5">
            <Image
              src="/icon.svg"
              alt="Stock and Crypto Tracker Logo"
              width={40}
              height={40}
              className="h-10 w-10"
            />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-semibold">Stock and Crypto</span>
              <span className="font-semibold text-violet-400">Tracker</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/pricing"
              className="text-lg font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("pricing")}
            </Link>
            <Link
              href="/about"
              className="text-lg font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("about")}
            </Link>
            <Link
              href="/blog"
              className="text-lg font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("blog")}
            </Link>
            {isClerkConfigured && (
              <SignedIn>
                <Link
                  href="/dashboard"
                  className="text-lg font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Dashboard
                </Link>
              </SignedIn>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          
          {isClerkConfigured ? (
            <>
              <SignedOut>
                <Button asChild variant="ghost" size="sm" className="hidden sm:flex gap-2">
                  <Link href="/sign-in">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:flex gap-2">
                  <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">
                    <Send className="h-4 w-4" />
                    {tHero("cta")}
                  </a>
                </Button>
              </SignedOut>
              
              <SignedIn>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "h-8 w-8",
                    },
                  }}
                />
              </SignedIn>
            </>
          ) : (
            <Button asChild size="sm" className="hidden sm:flex gap-2">
              <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">
                <Send className="h-4 w-4" />
                {tHero("cta")}
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
