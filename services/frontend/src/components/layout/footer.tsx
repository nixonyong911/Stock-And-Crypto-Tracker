"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        {/* Logo and Links Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-1.5 mb-4">
              <Image
                src="/icon.svg"
                alt="Stock and Crypto Tracker Logo"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <span className="flex flex-col leading-tight">
                <span className="font-semibold">Stock and Crypto</span>
                <span className="font-semibold text-violet-400">Tracker</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("tagline")}
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t("sections.product")}</h4>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                {t("pricing")}
              </Link>
              <Link href="/faq" className="hover:text-foreground transition-colors">
                {t("faq")}
              </Link>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {t("telegram")}
              </a>
            </nav>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t("sections.company")}</h4>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/about" className="hover:text-foreground transition-colors">
                {t("about")}
              </Link>
              <Link href="/blog" className="hover:text-foreground transition-colors">
                {t("blog")}
              </Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">
                {t("contact")}
              </Link>
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t("sections.legal")}</h4>
            <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link href="/terms" className="hover:text-foreground transition-colors">
                {t("terms")}
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                {t("privacy")}
              </Link>
            </nav>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Copyright */}
        <p className="text-center text-sm text-muted-foreground">
          {t("copyright", { year })}
        </p>
      </div>
    </footer>
  );
}
