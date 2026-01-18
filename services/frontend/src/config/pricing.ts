/**
 * Centralized pricing configuration
 * Environment variable (optional): NEXT_PUBLIC_PRICING_PRICE
 */

export const PRICING = {
    /** Monthly subscription price */
    price: process.env.NEXT_PUBLIC_PRICING_PRICE || "19.99",

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
