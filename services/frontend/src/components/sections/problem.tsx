"use client";

import { useTranslations } from "next-intl";

export function ProblemSection() {
  const t = useTranslations("problem");

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <div className="mt-8 space-y-4 text-lg text-muted-foreground">
            <p>{t("paragraph1")}</p>
            <p>{t("paragraph2")}</p>
            <p className="pt-4">
              {t("paragraph3")}
              <br />
              <span className="font-semibold text-foreground">
                {t("highlight")}
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
