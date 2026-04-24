"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { ChevronDown, Send } from "lucide-react";

const TELEGRAM_BOT_URL =
  "https://t.me/StockAndCryptoAdvisorBot?start=register";

const faqCategories = [
  { key: "general", questionsCount: 4 },
  { key: "pricing", questionsCount: 6 },
  { key: "technical", questionsCount: 4 },
  { key: "account", questionsCount: 3 },
  { key: "affiliate", questionsCount: 2 },
] as const;

type CategoryKey = (typeof faqCategories)[number]["key"];

function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-4 text-left"
      >
        <span className="font-medium pr-4">{question}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all ${
          isOpen ? "pb-4" : "max-h-0"
        }`}
      >
        <p className="text-muted-foreground">{answer}</p>
      </div>
    </div>
  );
}

export function FaqContent() {
  const t = useTranslations("faqPage");
  const [activeCategory, setActiveCategory] = useState<CategoryKey>("general");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (itemId: string) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const currentCategory = faqCategories.find((c) => c.key === activeCategory)!;

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

      {/* FAQ Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl">
            {/* Category Tabs */}
            <div className="mb-8 flex flex-wrap gap-2">
              {faqCategories.map(({ key }) => (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    activeCategory === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {t(`categories.${key}.title`)}
                </button>
              ))}
            </div>

            {/* FAQ Items */}
            <div className="rounded-lg border">
              <div className="p-6">
                <h2 className="mb-6 text-xl font-bold">
                  {t(`categories.${activeCategory}.title`)}
                </h2>
                <div>
                  {Array.from(
                    { length: currentCategory.questionsCount },
                    (_, i) => i + 1
                  ).map((num) => {
                    const itemId = `${activeCategory}-q${num}`;
                    return (
                      <FaqItem
                        key={itemId}
                        question={t(
                          `categories.${activeCategory}.questions.q${num}.question`
                        )}
                        answer={t(
                          `categories.${activeCategory}.questions.q${num}.answer`
                        )}
                        isOpen={openItems.has(itemId)}
                        onToggle={() => toggleItem(itemId)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Still Have Questions Section */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="mb-4 text-2xl font-bold">{t("contact.title")}</h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            {t("contact.description")}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="gap-2">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-4 w-4" />
                {t("contact.telegram")}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">{t("contact.email")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
