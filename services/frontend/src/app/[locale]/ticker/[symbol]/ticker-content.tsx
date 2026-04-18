"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Shield,
  Target,
  BarChart3,
} from "lucide-react";
import type { TickerInfo, PriceTarget } from "@/lib/db/tickers";

function formatPrice(price: number, assetType: string): string {
  if (assetType === "crypto" && price < 1) {
    return `$${price.toFixed(6)}`;
  }
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getSignalColor(signal: string | null): string {
  if (!signal) return "bg-muted text-muted-foreground";
  const s = signal.toLowerCase();
  if (s.includes("bull") || s.includes("buy") || s.includes("long"))
    return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
  if (s.includes("bear") || s.includes("sell") || s.includes("short"))
    return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
}

function SignalIcon({ signal }: { signal: string | null }) {
  if (!signal) return <Minus className="h-4 w-4" />;
  const s = signal.toLowerCase();
  if (s.includes("bull") || s.includes("buy") || s.includes("long"))
    return <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />;
  if (s.includes("bear") || s.includes("sell") || s.includes("short"))
    return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
  return <Minus className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
}

function ConfidenceMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const color =
    pct >= 70
      ? "bg-green-500"
      : pct >= 40
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-medium">{pct}%</span>
    </div>
  );
}

type Props = {
  ticker: TickerInfo;
  latest: PriceTarget | null;
  history: PriceTarget[];
};

export function TickerContent({ ticker, latest, history }: Props) {
  const t = useTranslations("tickerPage");

  const dailyChange =
    latest && latest.latestOpen
      ? ((latest.latestClose - latest.latestOpen) / latest.latestOpen) * 100
      : null;

  const upside =
    latest?.targetPrice && latest.latestClose
      ? ((latest.targetPrice - latest.latestClose) / latest.latestClose) * 100
      : null;

  const downside =
    latest?.stopLoss && latest.latestClose
      ? ((latest.stopLoss - latest.latestClose) / latest.latestClose) * 100
      : null;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {/* Hero */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs">
            {ticker.assetType === "crypto" ? t("hero.crypto") : t("hero.stock")}
          </Badge>
          {ticker.exchange && (
            <Badge variant="secondary" className="text-xs">
              {t("hero.exchange")}: {ticker.exchange}
            </Badge>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {ticker.symbol}
          {ticker.name && (
            <span className="ml-3 text-lg font-normal text-muted-foreground sm:text-xl">
              {ticker.name}
            </span>
          )}
        </h1>
        {latest && (
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">
              {formatPrice(latest.latestClose, ticker.assetType)}
            </span>
            {dailyChange !== null && (
              <span
                className={`text-sm font-medium ${dailyChange >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {formatPercent(dailyChange)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Signal Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t("signal.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-muted-foreground">{t("signal.noData")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("signal.analysisDate")}
                  </span>
                  <span className="text-sm font-medium">
                    {new Date(latest.analysisDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("signal.signal")}
                  </span>
                  <Badge
                    variant="outline"
                    className={`${getSignalColor(latest.signalSummary)} gap-1`}
                  >
                    <SignalIcon signal={latest.signalSummary} />
                    {latest.signalSummary ?? "—"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("signal.confidence")}
                  </span>
                  <ConfidenceMeter value={latest.confidence} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("signal.latestClose")}
                  </span>
                  <span className="font-medium">
                    {formatPrice(latest.latestClose, ticker.assetType)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {latest.entryPrice && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <ArrowRight className="h-3.5 w-3.5" />
                      {t("signal.entryPrice")}
                    </span>
                    <span className="font-medium">
                      {formatPrice(latest.entryPrice, ticker.assetType)}
                    </span>
                  </div>
                )}
                {latest.targetPrice && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      {t("signal.targetPrice")}
                    </span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {formatPrice(latest.targetPrice, ticker.assetType)}
                      {upside !== null && (
                        <span className="ml-1 text-xs">
                          ({formatPercent(upside)})
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {latest.stopLoss && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5" />
                      {t("signal.stopLoss")}
                    </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {formatPrice(latest.stopLoss, ticker.assetType)}
                      {downside !== null && (
                        <span className="ml-1 text-xs">
                          ({formatPercent(downside)})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signal History Table */}
      {history.length > 1 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t("history.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("history.date")}</TableHead>
                  <TableHead className="text-right">{t("history.close")}</TableHead>
                  <TableHead>{t("history.signal")}</TableHead>
                  <TableHead>{t("history.confidence")}</TableHead>
                  <TableHead className="text-right">{t("history.target")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.analysisDate}>
                    <TableCell className="text-sm">
                      {new Date(row.analysisDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatPrice(row.latestClose, ticker.assetType)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${getSignalColor(row.signalSummary)} text-xs gap-1`}
                      >
                        <SignalIcon signal={row.signalSummary} />
                        {row.signalSummary ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ConfidenceMeter value={row.confidence} />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {row.targetPrice
                        ? formatPrice(row.targetPrice, ticker.assetType)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-8 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">
            {t("cta.title", { symbol: ticker.symbol })}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            {t("cta.description", { symbol: ticker.symbol })}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <a
                href="https://t.me/StockAndCryptoAdvisorBot"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("cta.button")}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">{t("cta.secondaryButton")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t("disclaimer")}
      </p>
    </div>
  );
}
