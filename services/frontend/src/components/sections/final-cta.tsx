"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

export function FinalCtaSection() {
  const t = useTranslations("finalCta");

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/pricing">{t("cta")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("ctaTelegram")}
              </a>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{t("subtext")}</p>
        </div>
      </div>
    </section>
  );
}
