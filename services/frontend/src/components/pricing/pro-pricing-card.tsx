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
  billingPeriod: BillingPeriod;
  prices: {
    monthly: number;
    annual: number;
  };
  onCheckout: () => void;
  onStartTrial?: () => void;
  isLoading?: boolean;
  isTrialLoading?: boolean;
  error?: string | null;
  cta?: string;
  showTrialButton?: boolean;
  trialButtonLabel?: string;
  isSubscribed?: boolean;
}

export function ProPricingCard({
  billingPeriod,
  prices,
  onCheckout,
  onStartTrial,
  isLoading = false,
  isTrialLoading = false,
  error = null,
  cta,
  showTrialButton = true,
  trialButtonLabel = "Start 7-Day Free Trial",
  isSubscribed = false,
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
        {showTrialButton && (
          <div className="mb-4 rounded-lg bg-primary/5 px-3 py-2 text-center text-sm">
            <span className="font-medium text-primary">7-day free trial</span>
            <span className="text-muted-foreground"> · No card required</span>
          </div>
        )}
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
      <CardFooter className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {isSubscribed ? (
          <Button className="w-full" variant="outline" asChild>
            <a href="/dashboard/billing">Manage Subscription</a>
          </Button>
        ) : (
          <>
            {showTrialButton && onStartTrial && (
              <Button
                className="w-full gap-2"
                onClick={onStartTrial}
                disabled={isTrialLoading || isLoading}
              >
                {isTrialLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting trial...
                  </>
                ) : (
                  trialButtonLabel
                )}
              </Button>
            )}
            <Button
              className="w-full gap-2"
              variant={showTrialButton ? "outline" : "default"}
              onClick={onCheckout}
              disabled={isLoading || isTrialLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                cta ?? "Subscribe Now"
              )}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
