"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { BillingToggle, type BillingPeriod } from "./billing-toggle";
import { FreePricingCard } from "./free-pricing-card";
import { ProPricingCard } from "./pro-pricing-card";
import type { TrialEligibilityResponse } from "@/app/api/trial/eligibility/route";

const TELEGRAM_BOT_USERNAME = "StockAndCryptoAdvisorBot";

const DEFAULT_PRICES = {
  monthly: 19.99,
  annual: 167.99,
};

export interface PricingSectionProps {
  prices?: {
    monthly: number;
    annual: number;
  };
  freeCta?: string;
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
  const [isTrialLoading, setIsTrialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trialEligibility, setTrialEligibility] =
    useState<TrialEligibilityResponse | null>(null);

  const displayPrices = prices ?? DEFAULT_PRICES;

  const savingsPercentage = Math.round(
    ((displayPrices.monthly * 12 - displayPrices.annual) /
      (displayPrices.monthly * 12)) *
      100
  );

  const fetchTrialEligibility = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch("/api/trial/eligibility");
      if (res.ok) {
        setTrialEligibility(await res.json());
      }
    } catch {
      // Non-blocking: trial button falls back to hidden
    }
  }, [isSignedIn]);

  useEffect(() => {
    fetchTrialEligibility();
  }, [fetchTrialEligibility]);

  const handleCheckout = async () => {
    if (!isSignedIn) {
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

  const handleStartTrial = async () => {
    if (!isSignedIn) {
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent("/pricing")}`;
      return;
    }

    const elig = trialEligibility;

    if (!elig) return;

    if (elig.reason === "no_telegram") {
      window.location.href = `/pair?redirect_url=${encodeURIComponent("/pricing")}`;
      return;
    }

    if (elig.reason === "phone_not_verified") {
      window.open(
        `https://t.me/${TELEGRAM_BOT_USERNAME}?start=verify_phone`,
        "_blank"
      );
      return;
    }

    if (!elig.eligible) {
      setError("You are not eligible for a free trial.");
      return;
    }

    setIsTrialLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/start-trial", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to start trial");
        return;
      }

      window.location.href = "/dashboard/billing";
    } catch (err) {
      console.error("Trial error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsTrialLoading(false);
    }
  };

  const showTrialButton =
    !isSignedIn ||
    !trialEligibility ||
    trialEligibility.eligible ||
    trialEligibility.reason === "no_telegram" ||
    trialEligibility.reason === "phone_not_verified";

  const isSubscribed = trialEligibility?.reason === "already_subscribed";

  const trialButtonLabel = (() => {
    if (!isSignedIn || !trialEligibility) return "Start 7-Day Free Trial";
    if (trialEligibility.reason === "no_telegram")
      return "Link Telegram to Start Trial";
    if (trialEligibility.reason === "phone_not_verified")
      return "Verify Phone to Start Trial";
    return "Start 7-Day Free Trial";
  })();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-10">
        <BillingToggle
          billingPeriod={billingPeriod}
          onBillingChange={setBillingPeriod}
          savingsPercentage={savingsPercentage}
        />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <FreePricingCard cta={freeCta} />
        <ProPricingCard
          billingPeriod={billingPeriod}
          prices={displayPrices}
          onCheckout={handleCheckout}
          onStartTrial={handleStartTrial}
          isLoading={isLoading}
          isTrialLoading={isTrialLoading}
          error={error}
          cta={proCta}
          showTrialButton={showTrialButton}
          trialButtonLabel={trialButtonLabel}
          isSubscribed={isSubscribed}
        />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t("disclaimer")}
      </p>
    </div>
  );
}
