"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EconomicIndicator } from "@/lib/db/indicators";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FormattedIndicator {
  indicator: EconomicIndicator;
  formattedCurrent: string;
  formattedPrevious: string;
}

interface FormattedCategory {
  category: string;
  displayName: string;
  indicators: FormattedIndicator[];
}

interface Props {
  formattedCategories: FormattedCategory[];
}

type SortField = "name" | "current" | "change" | "date";
type SortDirection = "asc" | "desc";

export function IndicatorsTableClient({ formattedCategories }: Props) {
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
          comparison = (indA.current_observation_date ?? "").localeCompare(indB.current_observation_date ?? "");
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
    <div className="space-y-8">
      {formattedCategories.map(({ category, displayName, indicators }) => (
        <div key={category}>
          <h3 className="text-lg font-semibold mb-4 sticky top-0 bg-background py-2">
            {displayName}
          </h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader field="name">Indicator</SortHeader></TableHead>
                  <TableHead className="text-right"><SortHeader field="current">Current</SortHeader></TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right"><SortHeader field="change">Change</SortHeader></TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead className="text-right"><SortHeader field="date">Updated</SortHeader></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortIndicators(indicators).map(({ indicator, formattedCurrent, formattedPrevious }) => (
                  <TableRow key={indicator.series_id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{indicator.display_name}</TableCell>
                    <TableCell className="text-right font-mono">{formattedCurrent}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formattedPrevious}</TableCell>
                    <TableCell className="text-right">
                      {indicator.change_percent !== null && (
                        <span className={cn(
                          "font-mono",
                          indicator.change_percent > 0 && "text-green-600",
                          indicator.change_percent < 0 && "text-red-600"
                        )}>
                          {indicator.change_percent > 0 ? "+" : ""}{indicator.change_percent.toFixed(1)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell><TrendIcon trend={indicator.trend} /></TableCell>
                    <TableCell><SignalBadge signal={indicator.current_signal} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {indicator.current_observation_date && new Date(indicator.current_observation_date).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
