"use client";

import { useTranslations } from "next-intl";
import { GradientText } from "@/components/ui/gradient-text";
import { Shield } from "lucide-react";

export function TrustSection() {
  const t = useTranslations("trust");

  return (
    <section className="border-t">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>

          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("headingPrefix")}
            <GradientText>{t("headingAccent")}</GradientText>
            {t("headingSuffix")}
          </h2>

          <div className="mt-6 space-y-4 text-muted-foreground">
            <p>{t("paragraph1")}</p>
            <p>{t("paragraph2")}</p>
            <p className="font-medium text-foreground">{t("paragraph3")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
