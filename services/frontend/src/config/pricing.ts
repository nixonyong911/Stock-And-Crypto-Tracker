/**
 * Centralized pricing configuration
 * Used as fallback for global SEO schema only.
 * Actual prices are fetched dynamically from Stripe.
 */

export const PRICING = {
    /** Monthly subscription price (fallback for SEO) */
    price: "19.99",

    /** Currency code */
    currency: "USD",

    /** Price valid until date (ISO format) */
    priceValidUntil: "2026-12-31",
} as const;

/** Formatted price with currency symbol */
export const getFormattedPrice = () => {
    const symbol = PRICING.currency === "USD" ? "$" : PRICING.currency;
    return `${symbol}${PRICING.price}`;
};
