"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

const bulletKeys = [
  "context",
  "plain",
  "coverage",
  "fatigue",
  "education",
] as const;

export function FeaturesSection() {
  const t = useTranslations("features");

  return (
    <section className="border-t">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <ul className="mt-12 space-y-4 text-left">
            {bulletKeys.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-base text-muted-foreground">
                  {t(`bullets.${key}`)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-sm font-medium italic text-muted-foreground">
            {t("tagline")}
          </p>
        </div>
      </div>
    </section>
  );
}
