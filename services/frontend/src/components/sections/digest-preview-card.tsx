"use client";

import { useTranslations } from "next-intl";

/**
 * Telegram-style digest preview; copy under `smartDigest.mockMessage` + `smartDigest.messageLabels`.
 */
export function DigestPreviewCard() {
  const t = useTranslations("smartDigest.mockMessage");
  const l = useTranslations("smartDigest.messageLabels");

  return (
    <div className="rounded-2xl border border-primary/25 bg-muted/60 p-5 shadow-lg dark:border-primary/30 dark:bg-slate-950/75">
      <div className="space-y-3.5 font-mono text-sm leading-relaxed">
        <p className="font-semibold text-foreground">
          {t("ticker")} <span className="text-muted-foreground">|</span>{" "}
          {t("outlook")}{" "}
          <span className="text-muted-foreground">|</span> {t("horizon")}
        </p>
        <p className="text-xs text-muted-foreground">
          {l("confidence")}{" "}
          <span className="font-medium text-foreground">{t("confidence")}</span>
          <span className="mx-1.5 text-muted-foreground/60">|</span>
          {l("risk")}{" "}
          <span className="font-medium text-foreground">{t("risk")}</span>
        </p>

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
          <span className="font-semibold text-foreground">{l("whatToWatch")}</span>{" "}
          <span className="text-muted-foreground">{t("whatToWatch")}</span>
        </div>

        <div>
          <span className="font-semibold text-foreground">{l("newsFactor")}</span>{" "}
          <span className="text-muted-foreground">{t("newsFactor")}</span>
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
          <span className="text-muted-foreground sm:text-right">{t("timestamp")}</span>
        </div>
      </div>
    </div>
  );
}
