"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = () => {
    const currentIndex = locales.indexOf(locale as Locale);
    const nextIndex = (currentIndex + 1) % locales.length;
    const nextLocale = locales[nextIndex];

    const segments = pathname.split("/");
    segments[1] = nextLocale;
    router.push(segments.join("/"));
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      className="gap-1.5"
    >
      <Globe className="h-4 w-4" />
      <span className="hidden sm:inline">{localeNames[locale as Locale]}</span>
    </Button>
  );
}
