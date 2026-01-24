"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { BillingToggle, type BillingPeriod } from "./billing-toggle";
import { FreePricingCard } from "./free-pricing-card";
import { ProPricingCard } from "./pro-pricing-card";

/** Default prices (in dollars) - used when not provided */
const DEFAULT_PRICES = {
  monthly: 19.99,
  annual: 199.0,
};

export interface PricingSectionProps {
  /** Dynamic prices from Stripe (optional - uses defaults if not provided) */
  prices?: {
    monthly: number;
    annual: number;
  };
  /** Custom CTA text for free plan */
  freeCta?: string;
  /** Custom CTA text for pro plan */
  proCta?: string;
}

export function PricingSection({
  prices,
  freeCta,
  proCta,
}: PricingSectionProps) {
  const t = useTranslations("pricing");
  const { isSignedIn } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayPrices = prices ?? DEFAULT_PRICES;

  const savingsPercentage = Math.round(
    ((displayPrices.monthly * 12 - displayPrices.annual) /
      (displayPrices.monthly * 12)) *
      100
  );

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
    <div className="mx-auto max-w-4xl">
      {/* Billing Period Toggle */}
      <div className="mb-10">
        <BillingToggle
          billingPeriod={billingPeriod}
          onBillingChange={setBillingPeriod}
          savingsPercentage={savingsPercentage}
        />
      </div>

      {/* Pricing Cards */}
      <div className="grid gap-8 md:grid-cols-2">
        <FreePricingCard cta={freeCta} />
        <ProPricingCard
          billingPeriod={billingPeriod}
          prices={displayPrices}
          onCheckout={handleCheckout}
          isLoading={isLoading}
          error={error}
          cta={proCta}
        />
      </div>

      {/* Disclaimer */}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t("disclaimer")}
      </p>
    </div>
  );
}
