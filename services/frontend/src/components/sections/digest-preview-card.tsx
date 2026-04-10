"use client";

import { useTranslations } from "next-intl";

/**
 * Product-shaped preview card; copy lives under `smartDigest.mockMessage` in messages.
 */
export function DigestPreviewCard() {
  const t = useTranslations("smartDigest.mockMessage");

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-lg">
      <div className="space-y-4 font-mono text-sm leading-relaxed">
        <p className="font-bold text-foreground">
          {t("ticker")} &mdash; {t("headline")}
        </p>

        <div>
          <span className="font-semibold text-foreground">
            {t("whatsHappeningLabel")}
          </span>{" "}
          <span className="text-muted-foreground">{t("whatsHappening")}</span>
        </div>

        <div>
          <span className="font-semibold text-foreground">
            {t("whatToWatchLabel")}
          </span>{" "}
          <span className="text-muted-foreground">{t("whatToWatch")}</span>
        </div>

        <div className="border-t pt-3 text-xs text-muted-foreground">
          <span>
            Outlook:{" "}
            <span className="font-medium text-foreground">{t("outlook")}</span>
          </span>
          <span className="mx-2">|</span>
          <span>
            Horizon:{" "}
            <span className="font-medium text-foreground">{t("horizon")}</span>
          </span>
          <br />
          <span>
            Confidence:{" "}
            <span className="font-medium text-foreground">{t("confidence")}</span>
          </span>
          <span className="mx-2">|</span>
          <span>
            Risk:{" "}
            <span className="font-medium text-foreground">{t("risk")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
