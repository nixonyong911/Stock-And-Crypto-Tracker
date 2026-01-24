"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Check, Send, Loader2 } from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot?start=register";

const freeFeatures = ["stockCoverage", "alerts", "insights", "telegram"] as const;
const proFeatures = ["coverage", "signals", "priority", "telegram"] as const;

type BillingPeriod = "monthly" | "annual";

export interface PricingCardsProps {
  /** Dynamic prices from Stripe (optional - uses defaults if not provided) */
  prices?: {
    monthly: number;
    annual: number;
  };
  /** Callback for Pro plan checkout (if not provided, links to /pricing) */
  onCheckout?: (billingPeriod: BillingPeriod) => Promise<void>;
  /** Whether checkout is in progress */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Custom CTA text for free plan */
  freeCta?: string;
  /** Custom CTA text for pro plan */
  proCta?: string;
}

export function PricingCards({
  prices,
  onCheckout,
  isLoading = false,
  error = null,
  freeCta,
  proCta,
}: PricingCardsProps) {
  const t = useTranslations("pricing");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  // Default prices if not provided
  const displayPrices = {
    monthly: prices?.monthly ?? 19.99,
    annual: prices?.annual ?? 199.00,
  };

  const monthlyEquivalent = (displayPrices.annual / 12).toFixed(2);
  const savingsPercentage = Math.round(
    ((displayPrices.monthly * 12 - displayPrices.annual) / (displayPrices.monthly * 12)) * 100
  );

  const handleProClick = async () => {
    if (onCheckout) {
      await onCheckout(billingPeriod);
    }
  };

  return (
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
                {freeCta ?? t("free.cta")}
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
                  <span className="text-muted-foreground">/year</span>
                  <div className="mt-1 text-sm text-muted-foreground">
                    ${monthlyEquivalent}/month · Save $
                    {(displayPrices.monthly * 12 - displayPrices.annual).toFixed(0)}/year
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            {onCheckout ? (
              <Button
                className="w-full gap-2"
                onClick={handleProClick}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  proCta ?? "Start 7-Day Free Trial"
                )}
              </Button>
            ) : (
              <Button asChild className="w-full gap-2">
                <a href="/pricing">
                  <Send className="h-4 w-4" />
                  {proCta ?? t("pro.cta")}
                </a>
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t("disclaimer")}
      </p>
    </div>
  );
}

export type { BillingPeriod };
