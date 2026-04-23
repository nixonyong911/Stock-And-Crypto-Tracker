"use client";

import { useTranslations } from "next-intl";
import {
  Briefcase,
  Clock,
  GraduationCap,
  LineChart,
  type LucideIcon,
} from "lucide-react";

type PersonaKey = "beginner" | "busy" | "swing" | "parttime";

const PERSONAS: { key: PersonaKey; icon: LucideIcon }[] = [
  { key: "beginner", icon: GraduationCap },
  { key: "busy", icon: Briefcase },
  { key: "swing", icon: LineChart },
  { key: "parttime", icon: Clock },
];

export function WhoItsForSection() {
  const t = useTranslations("whoItsFor");

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>
        </div>

        <ul className="mx-auto mt-14 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {t(`personas.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`personas.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm italic text-muted-foreground">
          {t("footnote")}
        </p>
      </div>
    </section>
  );
}
