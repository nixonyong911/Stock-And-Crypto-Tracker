"use client";

export type BillingPeriod = "monthly" | "annual";

export interface BillingToggleProps {
  billingPeriod: BillingPeriod;
  onBillingChange: (period: BillingPeriod) => void;
  savingsPercentage: number;
}

export function BillingToggle({
  billingPeriod,
  onBillingChange,
  savingsPercentage,
}: BillingToggleProps) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center rounded-full bg-muted p-1">
        <button
          onClick={() => onBillingChange("monthly")}
          className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
            billingPeriod === "monthly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => onBillingChange("annual")}
          className={`rounded-full px-6 py-2 text-sm font-medium transition-all ${
            billingPeriod === "annual"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Annual
          <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
            Save {savingsPercentage}%
          </span>
        </button>
      </div>
    </div>
  );
}
