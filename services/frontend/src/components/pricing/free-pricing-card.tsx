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
import { Check, Send } from "lucide-react";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot?start=register";

const freeFeatures = ["stockCoverage", "alerts", "insights", "telegram"] as const;

export interface FreePricingCardProps {
  /** Custom CTA text */
  cta?: string;
}

export function FreePricingCard({ cta }: FreePricingCardProps) {
  const t = useTranslations("pricing");

  return (
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
            {cta ?? t("free.cta")}
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
