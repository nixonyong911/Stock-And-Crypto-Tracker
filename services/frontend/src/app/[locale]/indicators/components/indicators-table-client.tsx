"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormattedCategory, FormattedIndicator } from "./detail-view";

interface Props {
  formattedCategories: FormattedCategory[];
}

type SortField = "name" | "current" | "change" | "date";
type SortDirection = "asc" | "desc";

export function IndicatorsTableClient({ formattedCategories }: Props) {
  const t = useTranslations("indicators");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortIndicators = (items: FormattedIndicator[]) => {
    return [...items].sort((a, b) => {
      const indA = a.indicator;
      const indB = b.indicator;
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = indA.display_name.localeCompare(indB.display_name);
          break;
        case "current":
          comparison = (indA.media_current_value ?? indA.current_value ?? 0) - (indB.media_current_value ?? indB.current_value ?? 0);
          break;
        case "change":
          comparison = (indA.change_percent ?? 0) - (indB.change_percent ?? 0);
          break;
        case "date":
          comparison = (indA.last_release_date ?? indA.current_observation_date ?? "").localeCompare(indB.last_release_date ?? indB.current_observation_date ?? "");
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button variant="ghost" size="sm" onClick={() => handleSort(field)} className="-ml-3 h-8">
      {children}
      <ArrowUpDown className="ml-2 h-3 w-3" />
    </Button>
  );

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortHeader field="name">{t("table.indicator")}</SortHeader></TableHead>
            <TableHead className="text-right"><SortHeader field="current">{t("table.current")}</SortHeader></TableHead>
            <TableHead className="text-right">{t("table.previous")}</TableHead>
            <TableHead className="text-right"><SortHeader field="change">{t("table.change")}</SortHeader></TableHead>
            <TableHead>{t("table.signal")}</TableHead>
            <TableHead className="text-right"><SortHeader field="date">{t("table.updated")}</SortHeader></TableHead>
            <TableHead className="text-right">{t("table.nextRelease")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {formattedCategories.map(({ category, displayName, indicators }) => (
            <>
              <TableRow key={`header-${category}`} className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={7} className="font-semibold text-sm py-2">
                  {displayName}
                </TableCell>
              </TableRow>
              {sortIndicators(indicators).map(({ indicator, displayName: name, formattedCurrent, formattedPrevious, formattedChange, nextRelease }) => {
                const isStable = formattedChange === "stable";

                return (
                  <TableRow key={indicator.series_id} className="hover:bg-muted/30">
                    <TableCell className="font-medium pl-6">{name}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formattedCurrent}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formattedPrevious}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <TrendIcon trend={indicator.trend} className="h-3 w-3" />
                        <span className={cn(
                          "text-sm font-mono",
                          isStable
                            ? "text-muted-foreground"
                            : indicator.trend === "up"
                              ? "text-green-600"
                              : indicator.trend === "down"
                                ? "text-red-600"
                                : "text-muted-foreground"
                        )}>
                          {isStable ? t("status.stable") : formattedChange}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><SignalBadge signal={indicator.current_signal} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {(indicator.last_release_date ?? indicator.current_observation_date) &&
                        new Date(indicator.last_release_date ?? indicator.current_observation_date!).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {indicator.release_frequency === "Daily"
                        ? t("table.daily")
                        : nextRelease
                          ? new Date(nextRelease).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : t("table.na")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
