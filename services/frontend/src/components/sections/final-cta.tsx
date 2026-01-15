"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot?start=register";

export function FinalCtaSection() {
  const t = useTranslations("finalCta");

  return (
    <section className="border-t bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <div className="mt-8">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="gap-2 px-8"
            >
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-5 w-5" />
                {t("cta")}
              </a>
            </Button>
          </div>

          <p className="mt-4 text-sm text-primary-foreground/80">
            {t("subtext")}
          </p>
        </div>
      </div>
    </section>
  );
}
