"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";

const TELEGRAM_BOT_URL = "https://t.me/StockAndCryptoAdvisorBot";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="sct-footer">
      <div className="wrap">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="sct-brand mb-4">
              <div className="brand-mark">S</div>
              <span>SCT</span>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--ink-3)", lineHeight: 1.55, maxWidth: "36ch" }}>
              {t("tagline")}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4
              className="mb-4"
              style={{ fontFamily: "var(--font-mono-stack)", fontSize: "11px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)" }}
            >
              {t("sections.product")}
            </h4>
            <nav className="flex flex-col gap-2" style={{ fontSize: "13.5px" }}>
              <Link href="/pricing" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("pricing")}
              </Link>
              <Link href="/faq" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("faq")}
              </Link>
              <Link href="/docs" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("docs")}
              </Link>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
                style={{ color: "var(--ink-3)" }}
              >
                {t("telegram")}
              </a>
            </nav>
          </div>

          {/* Company */}
          <div>
            <h4
              className="mb-4"
              style={{ fontFamily: "var(--font-mono-stack)", fontSize: "11px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)" }}
            >
              {t("sections.company")}
            </h4>
            <nav className="flex flex-col gap-2" style={{ fontSize: "13.5px" }}>
              <Link href="/about" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("about")}
              </Link>
              <Link href="/blog" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("blog")}
              </Link>
              <Link href="/contact" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("contact")}
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div>
            <h4
              className="mb-4"
              style={{ fontFamily: "var(--font-mono-stack)", fontSize: "11px", fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)" }}
            >
              {t("sections.legal")}
            </h4>
            <nav className="flex flex-col gap-2" style={{ fontSize: "13.5px" }}>
              <Link href="/terms" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("terms")}
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors" style={{ color: "var(--ink-3)" }}>
                {t("privacy")}
              </Link>
            </nav>
          </div>
        </div>

        {/* Copyright */}
        <div
          className="mt-10 pt-6"
          style={{ borderTop: "1px solid var(--line)", fontFamily: "var(--font-mono-stack)", fontSize: "11px", letterSpacing: ".04em", color: "var(--ink-4)" }}
        >
          {t("copyright", { year })}
        </div>
      </div>
    </footer>
  );
}
