"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">SC</span>
            </div>
            <span className="font-semibold">Stock & Crypto Tracker</span>
          </div>

          <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">
              {t("about")}
            </Link>
            <Link
              href="#pricing"
              className="hover:text-foreground transition-colors"
            >
              {t("pricing")}
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              {t("terms")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              {t("privacy")}
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

          <Separator className="max-w-xs" />

          <p className="text-sm text-muted-foreground">
            {t("copyright", { year })}
          </p>
        </div>
      </div>
    </footer>
  );
}
