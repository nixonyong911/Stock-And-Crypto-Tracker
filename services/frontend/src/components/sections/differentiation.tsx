"use client";

import { useTranslations } from "next-intl";
import {
  Bot,
  Bell,
  Newspaper,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type ColumnKey = "ai" | "alerts" | "newsletters" | "sct";

const COLUMN_ORDER: ColumnKey[] = ["ai", "alerts", "newsletters", "sct"];
const ITEM_KEYS = ["context", "live", "framing"] as const;

const COLUMN_ICONS: Record<ColumnKey, LucideIcon> = {
  ai: Bot,
  alerts: Bell,
  newsletters: Newspaper,
  sct: Sparkles,
};

export function DifferentiationSection() {
  const t = useTranslations("differentiation");

  return (
    <section className="border-t">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subheading")}
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMN_ORDER.map((col) => {
            const Icon = COLUMN_ICONS[col];
            const isHighlight = col === "sct";
            return (
              <div
                key={col}
                className={`flex flex-col rounded-2xl border p-6 ${
                  isHighlight
                    ? "border-primary/40 bg-primary/5 shadow-sm"
                    : "border-border bg-card"
                }`}
              >
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${
                    isHighlight
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3
                  className={`text-base font-semibold ${
                    isHighlight ? "text-foreground" : "text-foreground/80"
                  }`}
                >
                  {t(`columns.${col}.title`)}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {ITEM_KEYS.map((item) => (
                    <li key={item} className="leading-snug">
                      {t(`columns.${col}.items.${item}`)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-muted-foreground">
          {t("footnote")}
        </p>
      </div>
    </section>
  );
}
