"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { BrainCircuit, MessageSquareText, ShieldCheck } from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

const bulletConfig = [
  { key: "multiTimeframe", icon: BrainCircuit },
  { key: "plainEnglish", icon: MessageSquareText },
  { key: "noSpam", icon: ShieldCheck },
] as const;

function MockTelegramMessage() {
  const t = useTranslations("smartDigest.mockMessage");

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-lg">
      <div className="space-y-4 font-mono text-sm leading-relaxed">
        <p className="font-bold text-foreground">
          {t("ticker")} &mdash; {t("headline")}
        </p>

        <div>
          <span className="font-semibold text-foreground">
            {t("whatsHappeningLabel")}
          </span>{" "}
          <span className="text-muted-foreground">{t("whatsHappening")}</span>
        </div>

        <div>
          <span className="font-semibold text-foreground">
            {t("whatToWatchLabel")}
          </span>{" "}
          <span className="text-muted-foreground">{t("whatToWatch")}</span>
        </div>

        <div className="border-t pt-3 text-xs text-muted-foreground">
          <span>
            Outlook: <span className="font-medium text-foreground">{t("outlook")}</span>
          </span>
          <span className="mx-2">|</span>
          <span>
            Horizon: <span className="font-medium text-foreground">{t("horizon")}</span>
          </span>
          <br />
          <span>
            Confidence: <span className="font-medium text-foreground">{t("confidence")}</span>
          </span>
          <span className="mx-2">|</span>
          <span>
            Risk: <span className="font-medium text-foreground">{t("risk")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function SmartDigestSection() {
  const t = useTranslations("smartDigest");

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("headingPrefix")}
              <GradientText>{t("headingAccent")}</GradientText>
              {t("headingSuffix")}
            </h2>

            <ul className="mt-10 space-y-5">
              {bulletConfig.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="pt-1.5 text-base text-muted-foreground">
                    {t(`bullets.${key}`)}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-sm font-medium italic text-muted-foreground">
              {t("tagline")}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">
                  {t("cta")}
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/smart-digest">{t("learnMore")}</Link>
              </Button>
            </div>
          </div>

          <div className="lg:pl-4">
            <MockTelegramMessage />
          </div>
        </div>
      </div>
    </section>
  );
}
