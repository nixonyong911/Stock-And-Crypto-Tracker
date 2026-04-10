"use client";

import { useTranslations } from "next-intl";

const ITEM_KEYS = ["one", "two", "three"] as const;

export function TestimonialsSection() {
  const t = useTranslations("testimonials");

  return (
    <section className="border-t">
      <div className="container mx-auto px-4 py-24">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
          {t("subheading")}
        </p>

        <ul className="mx-auto mt-14 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {ITEM_KEYS.map((key) => (
            <li
              key={key}
              className="flex flex-col rounded-xl border bg-card p-6 shadow-sm"
            >
              <blockquote className="flex-1 text-base leading-relaxed text-foreground">
                &ldquo;{t(`items.${key}.quote`)}&rdquo;
              </blockquote>
              <footer className="mt-6 border-t pt-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t(`items.${key}.name`)}
                </span>
                <span className="text-muted-foreground"> · </span>
                {t(`items.${key}.role`)}
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
