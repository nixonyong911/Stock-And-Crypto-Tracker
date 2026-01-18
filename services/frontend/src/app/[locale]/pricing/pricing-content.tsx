"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getFormattedPrice } from "@/config/pricing";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Send } from "lucide-react";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

const freeFeatures = ["analysis", "alerts", "insights", "telegram"] as const;
const proFeatures = ["coverage", "signals", "priority", "telegram"] as const;

// Feature comparison data
const comparisonFeatures = [
  { key: "dailyAnalysis", free: "Limited", pro: "Unlimited" },
  { key: "alertSpeed", free: "Delayed", pro: "Real-time" },
  { key: "stockCoverage", free: true, pro: true },
  { key: "cryptoCoverage", free: false, pro: true },
  { key: "signalConfidence", free: false, pro: true },
  { key: "priorityProcessing", free: false, pro: true },
  { key: "educationalInsights", free: true, pro: true },
  { key: "telegramAccess", free: true, pro: true },
] as const;

// Pricing FAQs
const pricingFaqs = [
  "cancelAnytime",
  "paymentMethods",
  "refundPolicy",
  "upgradeDowngrade",
  "trialPeriod",
] as const;

export function PricingContent() {
  const t = useTranslations("pricing");
  const tPage = useTranslations("pricingPage");

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

      {/* Pricing Cards */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 md:grid-cols-2">
              {/* Free Plan */}
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-2xl">{t("free.name")}</CardTitle>
                  <CardDescription>
                    <span className="text-4xl font-bold text-foreground">
                      {t("free.price")}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {freeFeatures.map((key) => (
                      <li key={key} className="flex items-center gap-3">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          {t(`free.features.${key}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" className="w-full gap-2">
                    <a
                      href={TELEGRAM_BOT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Send className="h-4 w-4" />
                      {t("free.cta")}
                    </a>
                  </Button>
                </CardFooter>
              </Card>

              {/* Pro Plan */}
              <Card className="relative flex flex-col border-primary">
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  {t("pro.badge")}
                </Badge>
                <CardHeader>
                  <CardTitle className="text-2xl">{t("pro.name")}</CardTitle>
                  <CardDescription>
                    <span className="text-4xl font-bold text-foreground">
                      {getFormattedPrice()}
                    </span>
                    <span className="text-muted-foreground">
                      {t("pro.period")}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {proFeatures.map((key) => (
                      <li key={key} className="flex items-center gap-3">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          {t(`pro.features.${key}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full gap-2">
                    <a
                      href={TELEGRAM_BOT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Send className="h-4 w-4" />
                      {t("pro.cta")}
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </div>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t("disclaimer")}
            </p>
          </div>
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
