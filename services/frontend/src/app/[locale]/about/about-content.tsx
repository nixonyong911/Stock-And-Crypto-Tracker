"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Eye, Shield, Zap, Send } from "lucide-react";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

const values = [
  { key: "clarity", icon: Eye },
  { key: "discipline", icon: Target },
  { key: "transparency", icon: Shield },
  { key: "simplicity", icon: Zap },
] as const;

export function AboutContent() {
  const t = useTranslations("aboutPage");

  return (
    <>
      {/* Hero Section */}
      <section className="border-b bg-muted/30 py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t("hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-bold">{t("mission.title")}</h2>
            <p className="mb-4 text-muted-foreground leading-relaxed">
              {t("mission.paragraph1")}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t("mission.paragraph2")}
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-bold">{t("story.title")}</h2>
            <p className="mb-4 text-muted-foreground leading-relaxed">
              {t("story.paragraph1")}
            </p>
            <p className="mb-4 text-muted-foreground leading-relaxed">
              {t("story.paragraph2")}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t("story.paragraph3")}
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-8 text-center text-2xl font-bold">
              {t("values.title")}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {values.map(({ key, icon: Icon }) => (
                <Card key={key}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="mb-2 font-semibold">
                          {t(`values.items.${key}.title`)}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t(`values.items.${key}.description`)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What We Are Not Section */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-bold">{t("whatWeAreNot.title")}</h2>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                {t("whatWeAreNot.item1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                {t("whatWeAreNot.item2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                {t("whatWeAreNot.item3")}
              </li>
            </ul>
            <p className="mt-6 text-muted-foreground">
              {t("whatWeAreNot.conclusion")}
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold">{t("cta.title")}</h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            {t("cta.description")}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="gap-2">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-4 w-4" />
                {t("cta.primary")}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">{t("cta.secondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
