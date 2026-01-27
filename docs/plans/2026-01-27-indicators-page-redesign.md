# Indicators Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the `/indicators` page with compact (category rows) and detail (table) views, calendar sidebar, responsive design, and media/raw data toggle.

**Architecture:** Server-side rendered Next.js page with URL-based state for view/data toggles. Horizontal scrollable category rows for compact view, sortable table for detail view, collapsible calendar sidebar.

**Tech Stack:** Next.js 14+ (RSC), Tailwind CSS, shadcn/ui components, Supabase

---

## Design Summary

### Layout Structure
- **Desktop (≥1024px):** Main content + 280px calendar sidebar
- **Tablet (768-1023px):** Full width + collapsible calendar panel at top
- **Mobile (<768px):** Stacked layout, calendar accordion, horizontal scroll rows

### Views
1. **Compact View:** Horizontal scrollable category rows with mini cards
2. **Detail View:** Sortable table (desktop) / stacked cards (mobile)

### Controls
- View toggle: "Compact" | "Detail" (pill buttons)
- Data toggle: "Media" | "Raw" (small switch)
- URL params: `?view=compact|detail&data=media|raw`

---

## Task 1: Update Data Layer

**Files:**
- Modify: `services/frontend/src/lib/db/indicators.ts`

**Step 1: Update EconomicIndicator interface**

```typescript
export interface EconomicIndicator {
  series_id: string;
  category: string;
  display_name: string;
  description: string | null;
  units: string | null;
  // Raw values
  current_value: number | null;
  previous_value: number | null;
  // Media values
  media_current_value: number | null;
  media_previous_value: number | null;
  // Computed
  change_percent: number | null;
  trend: "up" | "down" | "flat" | null;
  current_signal: "bullish" | "bearish" | "neutral" | null;
  // Display config
  display_mode: "rate" | "yoy_pct" | "trillions_from_billions" | "trillions_from_millions" | null;
  current_observation_date: string | null;
}
```

**Step 2: Update getEconomicIndicators query**

Add `previous_value`, `media_current_value`, `media_previous_value`, `display_mode` to select.

**Step 3: Add ReleaseCalendarEntry interface and fetch function**

```typescript
export interface ReleaseCalendarEntry {
  series_id: string;
  release_name: string;
  next_release_date: string | null;
  following_release_date: string | null;
  release_frequency: string | null;
}

export async function getReleaseCalendar(): Promise<ReleaseCalendarEntry[]> {
  // Query analysis_release_calendar joined with analysis_economic_indicators
}
```

**Step 4: Add helper to group releases by timeframe**

```typescript
export function groupReleasesByTimeframe(releases: ReleaseCalendarEntry[]): {
  today: ReleaseCalendarEntry[];
  tomorrow: ReleaseCalendarEntry[];
  thisWeek: ReleaseCalendarEntry[];
  nextWeek: ReleaseCalendarEntry[];
}
```

---

## Task 2: Create Shared Components

**Files:**
- Create: `services/frontend/src/app/[locale]/indicators/components/view-toggle.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/data-toggle.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/signal-badge.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/trend-icon.tsx`

**view-toggle.tsx:**
```typescript
"use client";
// Pill button toggle: Compact | Detail
// Uses useSearchParams to update URL
```

**data-toggle.tsx:**
```typescript
"use client";
// Small switch: Media | Raw
// Uses useSearchParams to update URL
```

**signal-badge.tsx:**
```typescript
// Reusable signal badge component (bullish/bearish/neutral)
```

**trend-icon.tsx:**
```typescript
// Reusable trend icon component (up/down/flat)
```

---

## Task 3: Create Compact View Components

**Files:**
- Create: `services/frontend/src/app/[locale]/indicators/components/compact-view.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/indicator-mini-card.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/category-row.tsx`

**compact-view.tsx:**
```typescript
// Main compact view container
// Maps categories to CategoryRow components
```

**category-row.tsx:**
```typescript
// Horizontal scrollable row with category title
// Contains IndicatorMiniCard components
// Scroll snap for mobile
```

**indicator-mini-card.tsx:**
```typescript
// ~120px wide card
// Shows: name, value, trend+signal indicator
// Tooltip on hover with previous value, change %, date
```

---

## Task 4: Create Detail View Components

**Files:**
- Create: `services/frontend/src/app/[locale]/indicators/components/detail-view.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/indicators-table.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/indicator-detail-card.tsx`

**detail-view.tsx:**
```typescript
// Main detail view container
// Desktop: IndicatorsTable
// Mobile: List of IndicatorDetailCard
```

**indicators-table.tsx:**
```typescript
// Sortable table with columns:
// Indicator, Current, Previous, Change, Trend, Signal, Last Update
// Grouped by category with sticky headers
// Uses shadcn Table component
```

**indicator-detail-card.tsx:**
```typescript
// Mobile card version of table row
// Stacked layout with all info visible
```

---

## Task 5: Create Calendar Sidebar

**Files:**
- Create: `services/frontend/src/app/[locale]/indicators/components/calendar-sidebar.tsx`
- Create: `services/frontend/src/app/[locale]/indicators/components/release-item.tsx`

**calendar-sidebar.tsx:**
```typescript
// Desktop: Fixed sidebar 280px
// Mobile/Tablet: Collapsible accordion
// Groups: Today, Tomorrow, This Week, Next Week
```

**release-item.tsx:**
```typescript
// Single release entry
// Shows: indicator name, date, frequency badge
```

---

## Task 6: Create Page Layout Component

**Files:**
- Create: `services/frontend/src/app/[locale]/indicators/components/indicators-layout.tsx`

**indicators-layout.tsx:**
```typescript
// Responsive layout wrapper
// Desktop: flex with sidebar
// Tablet: collapsible calendar at top
// Mobile: stacked with accordion
```

---

## Task 7: Update Main Page

**Files:**
- Modify: `services/frontend/src/app/[locale]/indicators/page.tsx`

**Changes:**
1. Import new components
2. Read `view` and `data` from searchParams
3. Fetch indicators and release calendar
4. Render IndicatorsLayout with appropriate view
5. Pass data mode to components for value selection

---

## Task 8: Add Value Formatting Utilities

**Files:**
- Create: `services/frontend/src/app/[locale]/indicators/lib/format.ts`

**format.ts:**
```typescript
export function formatIndicatorValue(
  indicator: EconomicIndicator,
  dataMode: "media" | "raw"
): string {
  const value = dataMode === "media" 
    ? indicator.media_current_value 
    : indicator.current_value;
  
  if (value === null) return "N/A";
  
  // Format based on display_mode and dataMode
  if (dataMode === "media") {
    // Media values are pre-formatted, just add units
    switch (indicator.display_mode) {
      case "rate":
      case "yoy_pct":
        return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
      case "trillions_from_billions":
      case "trillions_from_millions":
        return `$${value.toFixed(2)}T`;
      default:
        return value.toLocaleString();
    }
  } else {
    // Raw values need unit-based formatting
    // ... existing logic
  }
}
```

---

## Task 9: Add Responsive Styles

**Files:**
- Modify: `services/frontend/src/app/globals.css` (if needed)

**Styles:**
- Horizontal scroll with scroll-snap for category rows
- Hide scrollbar but keep functionality
- Smooth transitions for view switches

---

## Task 10: Test and Verify

**Steps:**
1. Run `npm run dev` in frontend
2. Test compact view on desktop, tablet, mobile
3. Test detail view on desktop, tablet, mobile
4. Test view toggle persistence in URL
5. Test data toggle (media vs raw values)
6. Test calendar sidebar collapse on mobile
7. Verify all indicators display correctly

---

## File Structure After Implementation

```
src/app/[locale]/indicators/
├── page.tsx                    # Main page (modified)
├── components/
│   ├── view-toggle.tsx         # Compact/Detail toggle
│   ├── data-toggle.tsx         # Media/Raw toggle
│   ├── signal-badge.tsx        # Reusable signal badge
│   ├── trend-icon.tsx          # Reusable trend icon
│   ├── indicators-layout.tsx   # Responsive layout wrapper
│   ├── compact-view.tsx        # Compact view container
│   ├── category-row.tsx        # Horizontal scroll row
│   ├── indicator-mini-card.tsx # Mini card for compact
│   ├── detail-view.tsx         # Detail view container
│   ├── indicators-table.tsx    # Sortable table
│   ├── indicator-detail-card.tsx # Mobile detail card
│   ├── calendar-sidebar.tsx    # Calendar sidebar/accordion
│   └── release-item.tsx        # Single release entry
└── lib/
    └── format.ts               # Value formatting utilities
```
