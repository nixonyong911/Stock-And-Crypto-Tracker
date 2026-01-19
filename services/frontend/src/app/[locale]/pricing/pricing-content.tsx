"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Send, Filter, Zap, GraduationCap, Loader2 } from "lucide-react";
import type { StripePrices } from "@/lib/stripe/prices";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

const freeFeatures = ["stockCoverage", "alerts", "insights", "telegram"] as const;
const proFeatures = ["coverage", "signals", "priority", "telegram"] as const;

// Feature comparison data
const comparisonFeatures = [
  { key: "dailyAnalysis", free: "Limited", pro: "Unlimited" },
  { key: "alertSpeed", free: "Delayed", pro: "End of day" },
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

// Benefits data with icons
const benefits = [
  { key: "reduceNoise", icon: Filter },
  { key: "marketContext", icon: Zap },
  { key: "learnFromAlerts", icon: GraduationCap },
] as const;

type BillingPeriod = "monthly" | "annual";

interface Props {
  prices: StripePrices;
}

export function PricingContent({ prices }: Props) {
  const t = useTranslations("pricing");
  const tPage = useTranslations("pricingPage");
  const { isSignedIn } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convert from cents to dollars, with fallback values
  const displayPrices = {
    monthly: prices.monthly ? prices.monthly.unitAmount / 100 : 19.99,
    annual: prices.annual ? prices.annual.unitAmount / 100 : 199.00,
  };

  const monthlyEquivalent = (displayPrices.annual / 12).toFixed(2);
  const savingsPercentage = Math.round(((displayPrices.monthly * 12 - displayPrices.annual) / (displayPrices.monthly * 12)) * 100);

  const handleCheckout = async () => {
    if (!isSignedIn) {
      // Redirect to sign in with return URL
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent("/pricing")}`;
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingPeriod }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to create checkout session");
        return;
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
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

      {/* Pricing Cards */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            {/* Billing Period Toggle */}
            <div className="mb-10 flex justify-center">
              <div className="inline-flex items-center rounded-full bg-muted p-1">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                    billingPeriod === "monthly"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod("annual")}
                  className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
                    billingPeriod === "annual"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Annual
                  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                    Save {savingsPercentage}%
                  </span>
                </button>
              </div>
            </div>

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
                      {tPage("ctas.tryFree")}
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
                    {billingPeriod === "monthly" ? (
                      <>
                        <span className="text-4xl font-bold text-foreground">
                          ${displayPrices.monthly.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">
                          {t("pro.period")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-bold text-foreground">
                          ${displayPrices.annual.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground">
                          /year
                        </span>
                        <div className="mt-1 text-sm text-muted-foreground">
                          ${monthlyEquivalent}/month · Save ${(displayPrices.monthly * 12 - displayPrices.annual).toFixed(0)}/year
                        </div>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-4 rounded-lg bg-primary/5 px-3 py-2 text-center text-sm">
                    <span className="font-medium text-primary">7-day free trial</span>
                    <span className="text-muted-foreground"> · Cancel anytime</span>
                  </div>
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
                <CardFooter className="flex flex-col gap-2">
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button 
                    className="w-full gap-2" 
                    onClick={handleCheckout}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Start 7-Day Free Trial"
                    )}
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
            <div className="mt-10 text-center">
              <Button asChild className="gap-2">
                <a
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4" />
                  {tPage("ctas.startLearning")}
                </a>
              </Button>
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
