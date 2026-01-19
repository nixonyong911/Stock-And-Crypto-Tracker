"use client";

import { useTranslations } from "next-intl";
import { SignInButton } from "@/components/ui/sign-in-button";

export function FinalCtaSection() {
  const t = useTranslations("finalCta");

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <div className="mt-8">
            <SignInButton size="lg" />
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {t("subtext")}
          </p>
        </div>
      </div>
    </section>
  );
}
