"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Check, X, Send, Filter, BookOpen, MessageCircle } from "lucide-react";
import { PricingSection } from "@/components/pricing";
import type { StripePrices } from "@/lib/stripe/prices";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

// Feature comparison data
const comparisonFeatures = [
  { key: "assetCoverage", free: "Stocks only", pro: "Stocks + crypto" },
  { key: "briefingDepth", free: "Key highlights", pro: "Full context with reasoning" },
  { key: "deliveryPriority", free: "Standard", pro: "Priority" },
  { key: "signalLabels", free: false, pro: true },
  { key: "telegramFollowUps", free: false, pro: true },
  { key: "educationalContext", free: true, pro: true },
  { key: "telegramDelivery", free: true, pro: true },
] as const;

// Pricing FAQs
const pricingFaqs = [
  "cancelAnytime",
  "paymentMethods",
  "refundPolicy",
  "upgradeDowngrade",
  "trialPeriod",
  "affiliateDiscount",
] as const;

// Benefits data with icons
const benefits = [
  { key: "reduceNoise", icon: Filter },
  { key: "marketContext", icon: BookOpen },
  { key: "learnFromAlerts", icon: MessageCircle },
] as const;

interface Props {
  prices: StripePrices;
}

export function PricingContent({ prices }: Props) {
  const t = useTranslations("pricing");
  const tPage = useTranslations("pricingPage");

  // Convert from cents to dollars, with fallback values
  const displayPrices = {
    monthly: prices.monthly ? prices.monthly.unitAmount / 100 : 19.99,
    annual: prices.annual ? prices.annual.unitAmount / 100 : 167.99,
  };

  return (
    <>
      {/* Hero Section */}
      <section className="border-b bg-muted/30 py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {tPage("hero.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {tPage("hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-12 border-b">
        <div className="container mx-auto px-4">
          <h2 className="mb-10 text-center text-2xl font-bold">
            {tPage("benefits.title")}
          </h2>
          <div className="mx-auto max-w-5xl grid gap-8 md:grid-cols-3">
            {benefits.map(({ key, icon: Icon }) => (
              <div key={key} className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">
                  {tPage(`benefits.items.${key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {tPage(`benefits.items.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild variant="outline" className="gap-2">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-4 w-4" />
                {tPage("benefits.cta")}
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Cards - Using shared component */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <PricingSection
            prices={displayPrices}
            freeCta={tPage("ctas.tryFree")}
          />
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-8 text-center text-2xl font-bold">
              {tPage("comparison.title")}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="py-4 text-left font-medium">
                      {tPage("comparison.feature")}
                    </th>
                    <th className="py-4 text-center font-medium">
                      {t("free.name")}
                    </th>
                    <th className="py-4 text-center font-medium text-primary">
                      {t("pro.name")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature) => (
                    <tr key={feature.key} className="border-b">
                      <td className="py-4 text-sm">
                        {tPage(`comparison.features.${feature.key}`)}
                      </td>
                      <td className="py-4 text-center">
                        {typeof feature.free === "boolean" ? (
                          feature.free ? (
                            <Check className="mx-auto h-5 w-5 text-primary" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-muted-foreground" />
                          )
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {feature.free}
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {typeof feature.pro === "boolean" ? (
                          feature.pro ? (
                            <Check className="mx-auto h-5 w-5 text-primary" />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-muted-foreground" />
                          )
                        ) : (
                          <span className="text-sm font-medium">
                            {feature.pro}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing FAQ */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-center text-2xl font-bold">
              {tPage("faq.title")}
            </h2>
            <div className="space-y-6">
              {pricingFaqs.map((faqKey) => (
                <div key={faqKey} className="border-b pb-6">
                  <h3 className="mb-2 font-medium">
                    {tPage(`faq.questions.${faqKey}.question`)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tPage(`faq.questions.${faqKey}.answer`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
