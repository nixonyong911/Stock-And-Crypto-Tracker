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
import { Check, Send } from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot?start=register";

const freeFeatures = ["analysis", "alerts", "insights", "telegram"] as const;
const proFeatures = ["coverage", "signals", "priority", "telegram"] as const;

export function PricingSection() {
  const t = useTranslations("pricing");

  return (
    <section id="pricing" className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <div className="mt-12 grid gap-8 md:grid-cols-2">
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
                    {t("free.cta")}
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
                  <span className="text-4xl font-bold text-foreground">
                    {t("pro.price")}
                  </span>
                  <span className="text-muted-foreground">
                    {t("pro.period")}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
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
              <CardFooter>
                <Button asChild className="w-full gap-2">
                  <a
                    href={TELEGRAM_BOT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Send className="h-4 w-4" />
                    {t("pro.cta")}
                  </a>
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
  );
}
