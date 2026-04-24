"use client";

import { useState, useEffect } from "react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SignInButton } from "@/components/ui/sign-in-button";
import { Menu, X } from "lucide-react";

const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const navLinks = [
  { href: "/pricing", labelKey: "pricing" },
  { href: "/faq", labelKey: "faq" },
  { href: "/docs", labelKey: "docs" },
  { href: "/blog", labelKey: "blog" },
  { href: "/indicators", labelKey: "indicators" },
  { href: "/affiliate", labelKey: "affiliate" },
  { href: "/smart-digest", labelKey: "smartDigest" },
] as const;

export function Header() {
  const t = useTranslations("nav");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sct-nav${scrolled ? " scrolled" : ""}`}>
      <div className="wrap nav-in">
        {/* Brand */}
        <Link href="/" className="sct-brand">
          <div className="brand-mark">S</div>
          <span>SCT</span>
        </Link>

        {/* Desktop nav */}
        <nav className="nav-links">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="nav-cta">
          <LanguageSwitcher />
          <ThemeToggle />

          {isClerkConfigured ? (
            <>
              <SignedOut>
                <SignInButton size="sm" className="sct-btn-ghost sct-btn-sm hidden sm:inline-flex" />
              </SignedOut>
              <SignedIn>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: { avatarBox: "h-8 w-8" },
                  }}
                />
              </SignedIn>
            </>
          ) : (
            <SignInButton size="sm" className="sct-btn-ghost sct-btn-sm hidden sm:inline-flex" />
          )}

          <Link href="/pricing" className="sct-btn sct-btn-sm hidden sm:inline-flex">
            Start Free
          </Link>

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

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden" style={{ borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
          <nav className="wrap flex flex-col py-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="py-2 text-sm font-medium"
                style={{ color: "var(--ink-3)" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                {t(link.labelKey)}
              </Link>
            ))}

            <div className="flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
              {isClerkConfigured ? (
                <>
                  <SignedOut>
                    <SignInButton size="sm" className="w-full justify-center sm:hidden" />
                  </SignedOut>
                  <SignedIn>
                    <Button asChild variant="ghost" size="sm" className="w-full justify-center sm:hidden">
                      <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                        Dashboard
                      </Link>
                    </Button>
                  </SignedIn>
                </>
              ) : (
                <SignInButton size="sm" className="w-full justify-center sm:hidden" />
              )}
              <Link
                href="/pricing"
                className="sct-btn justify-center sm:hidden"
                onClick={() => setMobileMenuOpen(false)}
              >
                Start Free
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
