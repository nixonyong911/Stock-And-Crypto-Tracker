"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ReleaseCalendarEntry, groupReleasesByTimeframe } from "@/lib/db/indicators";
import { ReleaseItem } from "./release-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { useMediaQuery } from "@/hooks/use-media-query";

interface Props {
  releases: ReleaseCalendarEntry[];
}

function ReleaseSection({ title, releases, showDate = true }: { title: string; releases: ReleaseCalendarEntry[]; showDate?: boolean }) {
  if (releases.length === 0) return null;
  
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h4>
      {releases.map((release) => (
        <ReleaseItem key={release.series_id} release={release} showDate={showDate} />
      ))}
    </div>
  );
}

export function CalendarSidebar({ releases }: Props) {
  const t = useTranslations("indicators");
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  
  const grouped = groupReleasesByTimeframe(releases);
  const totalUpcoming = grouped.today.length + grouped.tomorrow.length + grouped.thisWeek.length;
  
  // Desktop: Always visible sidebar
  if (isDesktop) {
    return (
      <Card className="w-[280px] shrink-0 h-fit sticky top-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            {t("calendar.upcomingReleases")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReleaseSection title={t("calendar.today")} releases={grouped.today} showDate={false} />
          <ReleaseSection title={t("calendar.tomorrow")} releases={grouped.tomorrow} showDate={false} />
          <ReleaseSection title={t("calendar.thisWeek")} releases={grouped.thisWeek} />
          <ReleaseSection title={t("calendar.nextWeek")} releases={grouped.nextWeek} />
          {totalUpcoming === 0 && grouped.nextWeek.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("calendar.noUpcoming")}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Mobile/Tablet: Collapsible accordion
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-4 h-auto">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="font-semibold">{t("calendar.upcomingReleases")}</span>
              {totalUpcoming > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {t("calendar.countThisWeek", { count: totalUpcoming })}
                </Badge>
              )}
            </div>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <ReleaseSection title={t("calendar.today")} releases={grouped.today} showDate={false} />
            <ReleaseSection title={t("calendar.tomorrow")} releases={grouped.tomorrow} showDate={false} />
            <ReleaseSection title={t("calendar.thisWeek")} releases={grouped.thisWeek} />
            <ReleaseSection title={t("calendar.nextWeek")} releases={grouped.nextWeek} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
