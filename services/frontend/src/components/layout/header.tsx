"use client";

import { useState, useRef, useCallback } from "react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { useCanHover } from "@/hooks/use-can-hover";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import Image from "next/image";
import { GradientText } from "@/components/ui/gradient-text";
import { SignInButton } from "@/components/ui/sign-in-button";
import { Menu, X, ChevronDown, BrainCircuit } from "lucide-react";

const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const featureItems = [
  {
    href: "/smart-digest",
    labelKey: "smartDigest",
    descKey: "smartDigestDesc",
    icon: BrainCircuit,
  },
] as const;

const CLOSE_DELAY_MS = 150;

export function Header() {
  const t = useTranslations("nav");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const canHover = useCanHover();
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    cancelClose();
    setFeaturesOpen(true);
  }, [cancelClose]);

  const handleMouseLeave = useCallback(() => {
    cancelClose();
    closeTimeout.current = setTimeout(() => setFeaturesOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const navLinks = [
    { href: "/pricing", label: t("pricing") },
    { href: "/about", label: t("about") },
    { href: "/indicators", label: t("indicators") },
    { href: "/affiliate", label: t("affiliate") },
    { href: "/docs", label: t("docs") },
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
            <DropdownMenu open={featuresOpen} onOpenChange={setFeaturesOpen}>
              <div
                onMouseEnter={canHover ? handleMouseEnter : undefined}
                onMouseLeave={canHover ? handleMouseLeave : undefined}
              >
                <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground outline-none">
                  {t("features")}
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-64"
                  onMouseEnter={canHover ? handleMouseEnter : undefined}
                  onMouseLeave={canHover ? handleMouseLeave : undefined}
                >
                  {featureItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className="flex items-start gap-3 p-3 cursor-pointer"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div>
                            <div className="text-sm font-medium">
                              {t(item.labelKey)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t(item.descKey)}
                            </div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </div>
            </DropdownMenu>

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

      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-4 space-y-1">
            {/* Features collapsible section */}
            <button
              type="button"
              className="flex items-center justify-between text-sm font-medium text-muted-foreground transition-colors hover:text-foreground py-2"
              onClick={() => setMobileFeaturesOpen(!mobileFeaturesOpen)}
            >
              {t("features")}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  mobileFeaturesOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {mobileFeaturesOpen && (
              <div className="pl-4 space-y-1">
                {featureItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <div>
                        <div className="font-medium">{t(item.labelKey)}</div>
                        <div className="text-xs">{t(item.descKey)}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

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
            
            {isClerkConfigured ? (
              <SignedOut>
                <SignInButton size="sm" className="w-full justify-center sm:hidden" />
              </SignedOut>
            ) : (
              <SignInButton size="sm" className="w-full justify-center sm:hidden" />
            )}
            
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
