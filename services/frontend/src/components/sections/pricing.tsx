"use client";

import { useTranslations } from "next-intl";
import { PricingSection } from "@/components/pricing";

export function PricingSection_HomePage() {
  const t = useTranslations("pricing");

  return (
    <section id="pricing" className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading")}
        </h2>
        <PricingSection />
      </div>
    </section>
  );
}

// Re-export with original name for backwards compatibility
export { PricingSection_HomePage as PricingSection };
