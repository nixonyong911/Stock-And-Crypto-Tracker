"use client";

import { useTranslations } from "next-intl";
import { Activity, Target, FileText, Send } from "lucide-react";

const steps = [
  { key: "step1", icon: Activity },
  { key: "step2", icon: Target },
  { key: "step3", icon: FileText },
  { key: "step4", icon: Send },
] as const;

export function HowItWorksSection() {
  const t = useTranslations("howItWorks");

  return (
    <section id="how-it-works" className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            {t("heading")}
          </h2>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.key}
                  className="relative flex flex-col items-center text-center"
                >
                  {/* Step number */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </div>

                  {/* Icon */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-card">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>

                  {/* Content */}
                  <h3 className="mt-6 text-lg font-semibold">
                    {t(`${step.key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t(`${step.key}.description`)}
                  </p>

                  {/* Connector line (hidden on last item and on mobile) */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-[calc(50%+3rem)] top-8 hidden h-px w-[calc(100%-6rem)] bg-border lg:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
