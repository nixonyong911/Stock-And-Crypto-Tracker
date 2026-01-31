"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EconomicIndicator, CATEGORY_CONFIG, groupIndicatorsByCategory, getSortedCategories } from "@/lib/db/indicators";
import { TrendIcon } from "./trend-icon";
import { SignalBadge } from "./signal-badge";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  indicators: EconomicIndicator[];
  formatValue: (indicator: EconomicIndicator, field: "current" | "previous") => string;
}

type SortField = "name" | "current" | "change" | "date";
type SortDirection = "asc" | "desc";

export function IndicatorsTable({ indicators, formatValue }: Props) {
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

  const grouped = groupIndicatorsByCategory(indicators);
  const sortedCategories = getSortedCategories(grouped);

  const sortIndicators = (items: EconomicIndicator[]) => {
    return [...items].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.display_name.localeCompare(b.display_name);
          break;
        case "current":
          comparison = (a.media_current_value ?? a.current_value ?? 0) - (b.media_current_value ?? b.current_value ?? 0);
          break;
        case "change":
          comparison = (a.change_percent ?? 0) - (b.change_percent ?? 0);
          break;
        case "date":
          comparison = (a.last_release_date ?? a.current_observation_date ?? "").localeCompare(b.last_release_date ?? b.current_observation_date ?? "");
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
      {sortedCategories.map((category) => (
        <div key={category}>
          <h3 className="text-lg font-semibold mb-4 sticky top-0 bg-background py-2">
            {CATEGORY_CONFIG[category]?.displayName ?? category}
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
                  <TableHead className="text-right">Next Release</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortIndicators(grouped[category]).map((indicator) => (
                  <TableRow key={indicator.series_id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{indicator.display_name}</TableCell>
                    <TableCell className="text-right font-mono">{formatValue(indicator, "current")}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatValue(indicator, "previous")}</TableCell>
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
                      {(indicator.last_release_date ?? indicator.current_observation_date) && 
                        new Date(indicator.last_release_date ?? indicator.current_observation_date!).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {indicator.release_frequency === "Daily"
                        ? "Daily"
                        : indicator.next_release_date &&
                          new Date(indicator.next_release_date).toLocaleDateString()}
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
