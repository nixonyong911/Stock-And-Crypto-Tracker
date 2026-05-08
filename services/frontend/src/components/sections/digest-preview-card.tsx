"use client";

import { useTranslations } from "next-intl";

type ExampleKey = "meta" | "sofi" | "aapl" | "btc";

interface DigestPreviewCardProps {
  /**
   * Which example to render. Defaults to `"meta"` (matches the previous
   * mock message). Other variants pull from `smartDigestPage.examples.*`.
   */
  example?: ExampleKey;
  /**
   * When true, renders the Telegram-style chrome (app bar, bot name) so
   * the card reads as a native chat message.
   */
  telegramChrome?: boolean;
}

/**
 * Telegram-style Smart Digest preview. Copy lives under
 * `smartDigest.mockMessage` (default) or `smartDigestPage.examples.{variant}`.
 */
export function DigestPreviewCard({
  example = "meta",
  telegramChrome = false,
}: DigestPreviewCardProps) {
  const l = useTranslations("smartDigest.messageLabels");
  const tDefault = useTranslations("smartDigest.mockMessage");
  const tExample = useTranslations(`smartDigestPage.examples.${example}`);

  const t = example === "meta" ? tDefault : tExample;

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/25 bg-muted/60 shadow-lg dark:border-primary/30 dark:bg-slate-950/75">
      {telegramChrome && (
        <div className="flex items-center gap-3 border-b bg-background/60 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="currentColor"
            >
              <path d="M9.036 15.803 8.88 19.2c.362 0 .52-.155.71-.341l1.705-1.63 3.535 2.585c.648.36 1.11.17 1.285-.6l2.329-10.9c.217-1.007-.363-1.4-1-.158L4.36 11.22c-.99.385-.977.939-.172 1.19l3.572 1.115 8.29-5.226c.39-.26.746-.116.453.146l-6.467 7.358Z" />
            </svg>
          </div>
          <div className="flex flex-1 flex-col">
            <span className="text-sm font-semibold text-foreground">
              Stock &amp; Crypto Tracker
            </span>
            <span className="text-xs text-muted-foreground">bot · online</span>
          </div>
          <span className="text-xs text-muted-foreground">{t("timestamp")}</span>
        </div>
      )}

      <div className="space-y-3.5 p-5 font-mono text-sm leading-relaxed">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-foreground">
            {t("ticker")} <span className="text-muted-foreground">|</span>{" "}
            {t("outlook")}
          </p>
          <p className="text-xs text-muted-foreground">
            {l("confidence")}{" "}
            <span className="font-medium text-foreground">
              {t("confidence")}
            </span>
          </p>
        </div>

        <p className="border-t border-border pt-3 text-[13px] text-foreground/90">
          {t("summary")}
        </p>

        <div>
          <span className="font-semibold text-foreground">
            {l("whatsHappening")}
          </span>{" "}
          <span className="text-muted-foreground">{t("whatsHappening")}</span>
        </div>

        <div>
          <span className="font-semibold text-foreground">
            {l("whatToWatch")}
          </span>{" "}
          <span className="text-muted-foreground">{t("whatToWatch")}</span>
        </div>

        <p className="border-t border-border pt-3 text-xs italic text-muted-foreground">
          {l("disclaimer")}
        </p>

        <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5 text-primary sm:flex-row sm:gap-4">
            <span className="underline decoration-primary/40 underline-offset-2">
              {l("viewWatchlist")}
            </span>
            <span className="underline decoration-primary/40 underline-offset-2">
              {l("pauseAlerts")}
            </span>
          </div>
          {!telegramChrome && (
            <span className="text-muted-foreground sm:text-right">
              {t("timestamp")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
