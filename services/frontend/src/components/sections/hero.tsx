"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { ArrowDown, CreditCard, Send, XCircle } from "lucide-react";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

const badgeIcons = {
  noCard: CreditCard,
  telegramNative: Send,
  cancelAnytime: XCircle,
} as const;

export function HeroSection() {
  const t = useTranslations("hero");

  const scrollToDigest = () => {
    try {
      document.getElementById("smart-digest")?.scrollIntoView({
        behavior: "smooth",
      });
    } catch {
      document.getElementById("smart-digest")?.scrollIntoView();
    }
  };

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />

      <div className="container mx-auto px-4 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </span>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t("headlinePrefix")}
            <GradientText>{t("headlineAccent")}</GradientText>
            {t("headlineSuffix")}
          </h1>

          <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            {t("subheadline")}
          </p>

          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="w-full gap-2 sm:w-auto">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-4 w-4" />
                {t("ctaPrimary")}
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2 sm:w-auto"
              onClick={scrollToDigest}
            >
              {t("ctaSecondary")}
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {t("ctaPrimaryHint")}{" "}
            <Link
              href="/get-started"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("ctaTelegram")}
            </Link>
          </p>

          <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground sm:text-sm">
            {(
              ["noCard", "telegramNative", "cancelAnytime"] as const
            ).map((key) => {
              const Icon = badgeIcons[key];
              return (
                <li key={key} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary/70" />
                  <span>{t(`trustBadges.${key}`)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
