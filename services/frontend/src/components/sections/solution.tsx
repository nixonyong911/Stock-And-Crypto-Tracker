"use client";

import { useTranslations } from "next-intl";
import { GradientText } from "@/components/ui/gradient-text";
import { ScanLine, Lightbulb, MessageSquareText, Send } from "lucide-react";

const icons = {
  scan: ScanLine,
  identify: Lightbulb,
  explain: MessageSquareText,
  deliver: Send,
};

export function SolutionSection() {
  const t = useTranslations("solution");

  const bullets = ["scan", "identify", "explain", "deliver"] as const;

  return (
    <section className="border-t">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("headingPrefix")}
            <GradientText>{t("headingAccent")}</GradientText>
            {t("headingSuffix")}
          </h2>

          <ul className="mt-12 grid gap-6 sm:grid-cols-2">
            {bullets.map((key) => {
              const Icon = icons[key];
              return (
                <li
                  key={key}
                  className="flex items-start gap-4 rounded-lg border bg-card p-6 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-base">{t(`bullets.${key}`)}</span>
                </li>
              );
            })}
          </ul>

          <p className="mt-8 text-lg font-medium text-muted-foreground">
            {t("tagline")}
          </p>
        </div>
      </div>
    </section>
  );
}
