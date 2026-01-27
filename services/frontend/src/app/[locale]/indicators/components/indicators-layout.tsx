"use client";

import { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ReleaseCalendarEntry } from "@/lib/db/indicators";
import { CalendarSidebar } from "./calendar-sidebar";

interface Props {
  children: ReactNode;
  releases: ReleaseCalendarEntry[];
}

export function IndicatorsLayout({ children, releases }: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Mobile/Tablet: Calendar at top */}
      {!isDesktop && (
        <div className="mb-6">
          <CalendarSidebar releases={releases} />
        </div>
      )}
      
      {/* Desktop: Side by side layout */}
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          {children}
        </div>
        
        {/* Desktop: Sidebar on right */}
        {isDesktop && (
          <CalendarSidebar releases={releases} />
        )}
      </div>
    </div>
  );
}
