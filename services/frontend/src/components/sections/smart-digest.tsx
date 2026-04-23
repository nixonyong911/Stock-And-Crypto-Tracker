"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import {
  CheckCircle2,
  MessageSquareText,
  Newspaper,
  Send,
  ShieldAlert,
  Tag,
  Target,
} from "lucide-react";
import { DigestPreviewCard } from "./digest-preview-card";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

type TabKey = "bullish" | "bearish" | "crypto";

const TAB_EXAMPLES: Record<TabKey, "meta" | "sofi" | "btc"> = {
  bullish: "meta",
  bearish: "sofi",
  crypto: "btc",
};

const anatomyItems = [
  { key: "signal", icon: Tag },
  { key: "happening", icon: MessageSquareText },
  { key: "watch", icon: Target },
  { key: "news", icon: Newspaper },
  { key: "actions", icon: ShieldAlert },
] as const;

export function SmartDigestSection() {
  const t = useTranslations("smartDigest");
  const [activeTab, setActiveTab] = useState<TabKey>("bullish");

  return (
    <section id="smart-digest" className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("headingPrefix")}
            <GradientText>{t("headingAccent")}</GradientText>
            {t("headingSuffix")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("subheading")}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl items-start gap-10 lg:grid-cols-5 lg:gap-12">
          <div className="lg:col-span-3">
            <div
              role="tablist"
              aria-label="Smart Digest examples"
              className="mb-4 flex flex-wrap gap-2"
            >
              {(Object.keys(TAB_EXAMPLES) as TabKey[]).map((key) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(key)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {t(`tabs.${key}`)}
                  </button>
                );
              })}
            </div>
            <DigestPreviewCard
              example={TAB_EXAMPLES[activeTab]}
              telegramChrome
            />
          </div>

          <div className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-foreground">
              {t("anatomy.heading")}
            </h3>
            <ul className="mt-5 space-y-4">
              {anatomyItems.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="pt-1.5 text-sm text-muted-foreground">
                    {t(`anatomy.items.${key}`)}
                  </p>
                </li>
              ))}
            </ul>

            <ul className="mt-8 space-y-3 border-t pt-6">
              {(["multiTimeframe", "plainEnglish", "noSpam"] as const).map(
                (key) => (
                  <li key={key} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {t(`bullets.${key}`)}
                    </p>
                  </li>
                )
              )}
            </ul>

            <p className="mt-6 text-sm font-medium italic text-muted-foreground">
              {t("tagline")}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <a
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4" />
                  {t("cta")}
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/smart-digest">{t("learnMore")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
