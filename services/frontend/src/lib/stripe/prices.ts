import { stripe } from "./stripe";
import { unstable_cache } from "next/cache";

export interface StripePriceInfo {
  id: string;
  unitAmount: number;
  currency: string;
  interval: "month" | "year";
  intervalCount: number;
  productId: string;
  productName: string;
  trialDays: number | null;
}

export interface StripePrices {
  monthly: StripePriceInfo | null;
  annual: StripePriceInfo | null;
  fetchedAt: string;
}

// Cache prices for 1 hour
export const getStripePrices = unstable_cache(
  async (): Promise<StripePrices> => {
    try {
      // Fetch all active prices for the Pro product
      const prices = await stripe.prices.list({
        active: true,
        type: "recurring",
        expand: ["data.product"],
        limit: 10,
      });

      const preferredMonthlyId = process.env.STRIPE_MONTHLY_PRICE_ID;
      const preferredAnnualId = process.env.STRIPE_ANNUAL_PRICE_ID;

      let monthly: StripePriceInfo | null = null;
      let annual: StripePriceInfo | null = null;

      for (const price of prices.data) {
        const product = price.product;
        if (typeof product === 'string') continue;
        if (!product || product.deleted) continue;
        
        const productObj = product as import("stripe").Stripe.Product;
        if (!productObj.active) continue;
        if (!productObj.name.toLowerCase().includes("pro")) continue;

        const priceInfo: StripePriceInfo = {
          id: price.id,
          unitAmount: price.unit_amount || 0,
          currency: price.currency,
          interval: price.recurring?.interval as "month" | "year",
          intervalCount: price.recurring?.interval_count || 1,
          productId: productObj.id,
          productName: productObj.name,
          trialDays: price.recurring?.trial_period_days || null,
        };

        if (price.recurring?.interval === "month") {
          if (preferredMonthlyId && price.id === preferredMonthlyId) {
            monthly = priceInfo;
          } else if (!preferredMonthlyId && !monthly) {
            monthly = priceInfo;
          }
        } else if (price.recurring?.interval === "year") {
          if (preferredAnnualId && price.id === preferredAnnualId) {
            annual = priceInfo;
          } else if (!preferredAnnualId && !annual) {
            annual = priceInfo;
          }
        }
      }

      return {
        monthly,
        annual,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching Stripe prices:", error);
      // Return fallback prices if Stripe fails
      return {
        monthly: {
          id: "fallback_monthly",
          unitAmount: 1999,
          currency: "usd",
          interval: "month",
          intervalCount: 1,
          productId: "fallback",
          productName: "Pro Plan",
          trialDays: 7,
        },
        annual: {
          id: "fallback_annual",
          unitAmount: 16799,
          currency: "usd",
          interval: "year",
          intervalCount: 1,
          productId: "fallback",
          productName: "Pro Plan",
          trialDays: 7,
        },
        fetchedAt: new Date().toISOString(),
      };
    }
  },
  ["stripe-prices"],
  { revalidate: 3600, tags: ["stripe-prices"] }
);

// Format price for display
export function formatPrice(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
  return formatter.format(amount / 100);
}

// Calculate monthly equivalent for annual price
export function getMonthlyEquivalent(annualAmount: number): number {
  return Math.round(annualAmount / 12);
}

// Calculate savings percentage
export function getSavingsPercentage(monthlyAmount: number, annualAmount: number): number {
  const yearlyIfMonthly = monthlyAmount * 12;
  const savings = yearlyIfMonthly - annualAmount;
  return Math.round((savings / yearlyIfMonthly) * 100);
}

