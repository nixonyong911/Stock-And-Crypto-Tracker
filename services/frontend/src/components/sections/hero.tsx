"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { DigestPreviewCard } from "./digest-preview-card";
import { ArrowDown } from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

export function HeroSection() {
  const t = useTranslations("hero");

  const scrollToHowItWorks = () => {
    try {
      document.getElementById("how-it-works")?.scrollIntoView({
        behavior: "smooth",
      });
    } catch {
      document.getElementById("how-it-works")?.scrollIntoView();
    }
  };

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />

      <div className="container mx-auto px-4 py-20 sm:py-28 lg:py-36">
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
          <div className="space-y-6 text-center lg:text-left">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t("headline")}
              <br />
              <span>
                {t("headlineHighlightPrefix")}
                <GradientText>{t("headlineHighlightAccent")}</GradientText>
                {t("headlineHighlightSuffix")}
              </span>
            </h1>

            <p className="text-lg leading-8 text-muted-foreground sm:text-xl">
              {t("subheadline")}
            </p>
          </div>

          <div className="lg:pt-4">
            <DigestPreviewCard />
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:col-span-1 lg:justify-start">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/pricing">{t("ctaPrimary")}</Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2 sm:w-auto"
              onClick={scrollToHowItWorks}
            >
              {t("ctaSecondary")}
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground lg:col-span-2 lg:flex-row lg:flex-wrap lg:justify-center lg:gap-x-6 lg:gap-y-2">
            <p className="lg:order-first">{t("ctaPrimaryHint")}</p>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("ctaTelegram")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
