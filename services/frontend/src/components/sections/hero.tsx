"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { SignInButton } from "@/components/ui/sign-in-button";
import { ArrowDown } from "lucide-react";

export function HeroSection() {
  const t = useTranslations("hero");

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />

      <div className="container mx-auto px-4 py-24 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {t("headline")}
            <br />
            <span>
              {t("headlineHighlightPrefix")}
              <GradientText>{t("headlineHighlightAccent")}</GradientText>
              {t("headlineHighlightSuffix")}
            </span>
          </h1>

          <p className="mt-6 text-lg leading-8 text-muted-foreground sm:text-xl">
            {t("subheadlinePart1")}
            <GradientText className="text-xl font-semibold sm:text-2xl">
              {t("subheadlineAccent")}
            </GradientText>
            {t("subheadlinePart2")}
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <SignInButton size="lg" />
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={scrollToHowItWorks}
            >
              {t("ctaSecondary")}
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
