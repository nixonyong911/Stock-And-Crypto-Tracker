"use client";

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
import { Check, Loader2 } from "lucide-react";
import type { BillingPeriod } from "./billing-toggle";

const proFeatures = ["coverage", "signals", "priority", "telegram"] as const;

export interface ProPricingCardProps {
  /** Current billing period selection */
  billingPeriod: BillingPeriod;
  /** Price configuration */
  prices: {
    monthly: number;
    annual: number;
  };
  /** Callback for checkout - triggers Stripe */
  onCheckout: () => void;
  /** Whether checkout is in progress */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Custom CTA text */
  cta?: string;
}

export function ProPricingCard({
  billingPeriod,
  prices,
  onCheckout,
  isLoading = false,
  error = null,
  cta,
}: ProPricingCardProps) {
  const t = useTranslations("pricing");

  const monthlyEquivalent = (prices.annual / 12).toFixed(2);
  const yearlySavings = (prices.monthly * 12 - prices.annual).toFixed(0);

  return (
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
                ${prices.monthly.toFixed(2)}
              </span>
              <span className="text-muted-foreground">
                {t("pro.period")}
              </span>
            </>
          ) : (
            <>
              <span className="text-4xl font-bold text-foreground">
                ${prices.annual.toFixed(2)}
              </span>
              <span className="text-muted-foreground">/year</span>
              <div className="mt-1 text-sm text-muted-foreground">
                ${monthlyEquivalent}/month · Save ${yearlySavings}/year
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
        <Button
          className="w-full gap-2"
          onClick={onCheckout}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            cta ?? "Start 7-Day Free Trial"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
