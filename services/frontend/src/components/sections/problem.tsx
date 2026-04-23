"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const PAIN_KEYS = ["tabs", "noise", "alerts", "behind"] as const;
const RELIEF_KEYS = ["oneFeed", "context", "horizon", "telegram"] as const;

export function ProblemSection() {
  const t = useTranslations("painRelief");

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subheading")}
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {t("painHeading")}
              </h3>
            </div>
            <ul className="space-y-3 text-base text-muted-foreground">
              {PAIN_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/60"
                  />
                  <span>{t(`painItems.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-primary/30 bg-card p-8 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {t("reliefHeading")}
              </h3>
            </div>
            <ul className="space-y-3 text-base text-muted-foreground">
              {RELIEF_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t(`reliefItems.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm font-medium italic text-muted-foreground">
          {t("tagline")}
        </p>
      </div>
    </section>
  );
}
