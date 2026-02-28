"use client";

import { useState, useRef, useCallback } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, localeNames, type Locale } from "@/lib/i18n/config";
import { Globe, Check } from "lucide-react";
import { useCanHover } from "@/hooks/use-can-hover";

const CLOSE_DELAY_MS = 150;

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const canHover = useCanHover();
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const handleMouseLeave = useCallback(() => {
    cancelClose();
    closeTimeout.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const switchLocale = useCallback(
    (target: Locale) => {
      const segments = pathname.split("/");
      segments[1] = target;
      router.push(segments.join("/"));
      setOpen(false);
    },
    [pathname, router],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div
        onMouseEnter={canHover ? handleMouseEnter : undefined}
        onMouseLeave={canHover ? handleMouseLeave : undefined}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">
              {localeNames[locale as Locale]}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onMouseEnter={canHover ? handleMouseEnter : undefined}
          onMouseLeave={canHover ? handleMouseLeave : undefined}
        >
          {locales.map((loc) => (
            <DropdownMenuItem
              key={loc}
              onClick={() => switchLocale(loc)}
              className="gap-2"
            >
              {localeNames[loc]}
              {loc === locale && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}
