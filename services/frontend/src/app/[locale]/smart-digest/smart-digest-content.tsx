"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import {
  ListPlus,
  ScanSearch,
  MessageSquareText,
  TrendingUp,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

const stepIcons = [ListPlus, ScanSearch, MessageSquareText] as const;

const includeItems = [
  { key: "signal", icon: TrendingUp },
  { key: "horizon", icon: Clock },
  { key: "confidence", icon: ShieldCheck },
  { key: "risk", icon: AlertTriangle },
] as const;

function ExampleMessage({
  ticker,
  outlook,
  horizon,
  confidence,
  risk,
  summary,
  whatsHappening,
  whatToWatch,
  newsFactor,
  timestamp,
}: {
  ticker: string;
  outlook: string;
  horizon: string;
  confidence: string;
  risk: string;
  summary: string;
  whatsHappening: string;
  whatToWatch: string;
  newsFactor: string;
  timestamp: string;
}) {
  const l = useTranslations("smartDigest.messageLabels");

  return (
    <div className="rounded-2xl border border-primary/25 bg-muted/60 p-5 shadow-md dark:border-primary/30 dark:bg-slate-950/75">
      <div className="space-y-3.5 font-mono text-sm leading-relaxed">
        <p className="font-semibold text-foreground">
          {ticker} <span className="text-muted-foreground">|</span> {outlook}{" "}
          <span className="text-muted-foreground">|</span> {horizon}
        </p>
        <p className="text-xs text-muted-foreground">
          {l("confidence")}{" "}
          <span className="font-medium text-foreground">{confidence}</span>
          <span className="mx-1.5 text-muted-foreground/60">|</span>
          {l("risk")}{" "}
          <span className="font-medium text-foreground">{risk}</span>
        </p>
        <p className="border-t border-border pt-3 text-[13px] text-foreground/90">
          {summary}
        </p>
        <div>
          <span className="font-semibold text-foreground">
            {l("whatsHappening")}
          </span>{" "}
          <span className="text-muted-foreground">{whatsHappening}</span>
        </div>
        <div>
          <span className="font-semibold text-foreground">{l("whatToWatch")}</span>{" "}
          <span className="text-muted-foreground">{whatToWatch}</span>
        </div>
        <div>
          <span className="font-semibold text-foreground">{l("newsFactor")}</span>{" "}
          <span className="text-muted-foreground">{newsFactor}</span>
        </div>
        <p className="border-t border-border pt-3 text-xs italic text-muted-foreground">
          {l("disclaimer")}
        </p>
        <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5 text-primary sm:flex-row sm:gap-4">
            <span className="underline decoration-primary/40 underline-offset-2">
              {l("viewWatchlist")}
            </span>
            <span className="underline decoration-primary/40 underline-offset-2">
              {l("pauseAlerts")}
            </span>
          </div>
          <span className="text-muted-foreground sm:text-right">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}

export function SmartDigestContent() {
  const t = useTranslations("smartDigestPage");

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <GradientText>{t("hero.title")}</GradientText>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t("hero.subtitle")}
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section className="border-b">
        <div className="container mx-auto px-4 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("howItWorks.heading")}
          </h2>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {(["step1", "step2", "step3"] as const).map((step, index) => {
              const Icon = stepIcons[index];
              return (
                <div
                  key={step}
                  className="relative flex flex-col items-center text-center"
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-card">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">
                    {t(`howItWorks.${step}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(`howItWorks.${step}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Multi-Timeframe Comparison */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
              {t("multiTimeframe.heading")}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-center text-muted-foreground">
              {t("multiTimeframe.description")}
            </p>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-destructive/30 bg-card p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                  {t("multiTimeframe.basicLabel")}
                </p>
                <p className="mt-4 font-mono text-sm text-muted-foreground">
                  {t("multiTimeframe.basicMessage")}
                </p>
              </div>

              <div className="rounded-xl border border-primary/30 bg-card p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {t("multiTimeframe.smartLabel")}
                </p>
                <p className="mt-4 font-mono text-sm text-muted-foreground">
                  {t("multiTimeframe.smartMessage")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Example Messages */}
      <section className="border-b">
        <div className="container mx-auto px-4 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("examples.heading")}
          </h2>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {(["meta", "sofi", "aapl"] as const).map((example) => (
              <ExampleMessage
                key={example}
                ticker={t(`examples.${example}.ticker`)}
                outlook={t(`examples.${example}.outlook`)}
                horizon={t(`examples.${example}.horizon`)}
                confidence={t(`examples.${example}.confidence`)}
                risk={t(`examples.${example}.risk`)}
                summary={t(`examples.${example}.summary`)}
                whatsHappening={t(`examples.${example}.whatsHappening`)}
                whatToWatch={t(`examples.${example}.whatToWatch`)}
                newsFactor={t(`examples.${example}.newsFactor`)}
                timestamp={t(`examples.${example}.timestamp`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* What Each Message Includes */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-24">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("includes.heading")}
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {includeItems.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="flex flex-col items-center text-center rounded-xl border bg-card p-6"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <p className="mt-4 text-sm font-medium">
                  {t(`includes.${key}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("cta.heading")}
          </h2>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("cta.primary")}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">{t("cta.secondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
