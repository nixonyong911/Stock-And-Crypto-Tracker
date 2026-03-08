"use client";

import { useState } from "react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import Image from "next/image";
import { GradientText } from "@/components/ui/gradient-text";
import { SignInButton } from "@/components/ui/sign-in-button";
import { Menu, X } from "lucide-react";

// Check if Clerk is configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function Header() {
  const t = useTranslations("nav");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/pricing", label: t("pricing") },
    { href: "/about", label: t("about") },
    { href: "/indicators", label: t("indicators") },
    { href: "/affiliate", label: t("affiliate") },
    { href: "/blog", label: t("blog") },
  ];

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
              <GradientText className="font-semibold">Tracker</GradientText>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          
          {isClerkConfigured ? (
            <>
              <SignedOut>
                <SignInButton size="sm" className="hidden sm:flex" />
              </SignedOut>
              
              <SignedIn>
                <Button asChild variant="ghost" size="sm" className="hidden sm:flex">
                  <Link href="/dashboard">
                    Dashboard
                  </Link>
                </Button>
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
            <SignInButton size="sm" className="hidden sm:flex" />
          )}
          
          <ThemeToggle />

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-4 space-y-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            
            {/* Mobile-only sign in button */}
            {isClerkConfigured ? (
              <SignedOut>
                <SignInButton size="sm" className="w-full justify-center sm:hidden" />
              </SignedOut>
            ) : (
              <SignInButton size="sm" className="w-full justify-center sm:hidden" />
            )}
            
            {/* Mobile-only dashboard link */}
            {isClerkConfigured && (
              <SignedIn>
                <Button asChild variant="ghost" size="sm" className="w-full justify-center sm:hidden">
                  <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              </SignedIn>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
