"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { useConsent } from "./consent-banner";

type Props = {
  gaMeasurementId?: string;
};

export function AnalyticsProvider({ gaMeasurementId }: Props) {
  const { consent, hydrated } = useConsent();

  if (!hydrated || consent !== "accepted") return null;

  return (
    <>
      <SpeedInsights />
      <VercelAnalytics />
      {gaMeasurementId ? <GoogleAnalytics gaId={gaMeasurementId} /> : null}
    </>
  );
}
