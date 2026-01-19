/**
 * Centralized locale detection configuration
 *
 * This module handles automatic locale detection based on:
 * 1. User's country (via geo headers) - zero loading impact, runs at edge
 * 2. Browser's Accept-Language header as fallback
 *
 * Add new locales and country mappings here for easy maintenance.
 */

import { locales, defaultLocale, type Locale } from "./config";

/**
 * Country codes that should default to Chinese (zh)
 * ISO 3166-1 alpha-2 country codes
 */
export const chineseCountries = [
  "CN", // China
  "TW", // Taiwan
  "HK", // Hong Kong
  "MO", // Macau
  "SG", // Singapore (significant Chinese-speaking population)
] as const;

/**
 * Map of country codes to their preferred locale
 * Add new mappings here when supporting more languages
 *
 * Countries not in this map will use defaultLocale
 */
export const countryToLocale: Record<string, Locale> = {
  // Chinese-speaking regions
  CN: "zh",
  TW: "zh",
  HK: "zh",
  MO: "zh",
  SG: "zh",

  // English-speaking regions (explicit for clarity, though 'en' is default)
  US: "en",
  GB: "en",
  AU: "en",
  CA: "en",
  NZ: "en",

  // Add more mappings as you add languages:
  // JP: "ja",  // Japanese
  // KR: "ko",  // Korean
  // DE: "de",  // German
  // FR: "fr",  // French
  // ES: "es",  // Spanish
};

/**
 * Language codes from Accept-Language header to locale mapping
 * Used as fallback when geo detection isn't available
 */
export const languageToLocale: Record<string, Locale> = {
  // Chinese variants
  zh: "zh",
  "zh-CN": "zh",
  "zh-TW": "zh",
  "zh-HK": "zh",
  "zh-Hans": "zh",
  "zh-Hant": "zh",

  // English variants
  en: "en",
  "en-US": "en",
  "en-GB": "en",
  "en-AU": "en",

  // Add more language mappings as needed
};

/**
 * Detect locale from country code
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "US", "CN")
 * @returns The appropriate locale or null if no mapping exists
 */
export function getLocaleFromCountry(
  countryCode: string | undefined | null
): Locale | null {
  if (!countryCode) return null;
  return countryToLocale[countryCode.toUpperCase()] ?? null;
}

/**
 * Detect locale from Accept-Language header
 * @param acceptLanguage - The Accept-Language header value
 * @returns The best matching locale or null
 */
export function getLocaleFromAcceptLanguage(
  acceptLanguage: string | undefined | null
): Locale | null {
  if (!acceptLanguage) return null;

  // Parse Accept-Language header (e.g., "zh-CN,zh;q=0.9,en;q=0.8")
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [code, qValue] = lang.trim().split(";q=");
      return {
        code: code.trim(),
        quality: qValue ? parseFloat(qValue) : 1.0,
      };
    })
    .sort((a, b) => b.quality - a.quality);

  // Find the first matching locale
  for (const { code } of languages) {
    // Try exact match first
    if (languageToLocale[code]) {
      return languageToLocale[code];
    }

    // Try base language (e.g., "zh" from "zh-CN")
    const baseCode = code.split("-")[0];
    if (languageToLocale[baseCode]) {
      return languageToLocale[baseCode];
    }

    // Check if it's a supported locale directly
    if (locales.includes(code as Locale)) {
      return code as Locale;
    }
  }

  return null;
}

/**
 * Detect the best locale for a user based on available signals
 * Priority: 1. Country (geo) -> 2. Accept-Language -> 3. Default
 *
 * @param countryCode - Country code from geo headers (Vercel provides this)
 * @param acceptLanguage - Accept-Language header from browser
 * @returns The detected locale
 */
export function detectLocale(
  countryCode: string | undefined | null,
  acceptLanguage: string | undefined | null
): Locale {
  // 1. Try country-based detection first (most accurate for our use case)
  const countryLocale = getLocaleFromCountry(countryCode);
  if (countryLocale) {
    return countryLocale;
  }

  // 2. Fall back to Accept-Language header
  const languageLocale = getLocaleFromAcceptLanguage(acceptLanguage);
  if (languageLocale) {
    return languageLocale;
  }

  // 3. Default locale
  return defaultLocale;
}

/**
 * Check if a pathname already has a locale prefix
 */
export function pathnameHasLocale(pathname: string): boolean {
  return locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );
}

/**
 * Cookie name for storing user's locale preference
 */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

/**
 * Get locale from cookie value
 */
export function getLocaleFromCookie(
  cookieValue: string | undefined | null
): Locale | null {
  if (!cookieValue) return null;
  if (locales.includes(cookieValue as Locale)) {
    return cookieValue as Locale;
  }
  return null;
}
