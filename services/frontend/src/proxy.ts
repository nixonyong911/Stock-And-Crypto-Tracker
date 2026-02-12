/**
 * Next.js 16 Proxy (replaces deprecated middleware.ts)
 *
 * Handles:
 * 1. Automatic locale detection and redirection
 * 2. Authentication via Clerk
 *
 * Runs at the edge with zero impact on page load speed.
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  detectLocale,
  pathnameHasLocale,
  LOCALE_COOKIE_NAME,
  getLocaleFromCookie,
} from "@/lib/i18n/locale-detection";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  // Locale-prefixed routes
  "/:locale",
  "/:locale/sign-in(.*)",
  "/:locale/sign-up(.*)",
  "/:locale/pricing(.*)",
  "/:locale/about(.*)",
  "/:locale/contact(.*)",
  "/:locale/faq(.*)",
  "/:locale/blog(.*)",
  "/:locale/indicators(.*)",
  "/:locale/privacy(.*)",
  "/:locale/terms(.*)",
  "/:locale/dashboard(.*)",
  "/:locale/pair(.*)",
]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // Skip locale handling for API routes, Next.js internals, and static files
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    // Still protect non-public API routes
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
    return;
  }

  // Check if pathname already has a locale
  if (pathnameHasLocale(pathname)) {
    // Route has locale, just handle auth
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
    return;
  }

  // --- Locale Detection ---
  // Priority: Cookie > Geo (Country) > Accept-Language > Default

  // 1. Check for existing locale preference in cookie
  const cookieLocale = getLocaleFromCookie(
    request.cookies.get(LOCALE_COOKIE_NAME)?.value
  );

  let detectedLocale: string;

  if (cookieLocale) {
    // User has a saved preference
    detectedLocale = cookieLocale;
  } else {
    // 2. Detect from geo/headers (runs at edge, zero latency impact)
    // Vercel provides x-vercel-ip-country header automatically
    // Cloudflare provides cf-ipcountry header
    const countryCode =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      request.headers.get("x-country-code"); // Custom header fallback

    const acceptLanguage = request.headers.get("accept-language");

    detectedLocale = detectLocale(countryCode, acceptLanguage);
  }

  // Build the redirect URL with basePath support for VM staging
  const basePath = process.env.USE_BASE_PATH === "true" ? "/front-end" : "";
  const newUrl = new URL(request.url);
  newUrl.pathname = `${basePath}/${detectedLocale}${pathname === "/" ? "" : pathname}`;

  // Create redirect response
  const response = NextResponse.redirect(newUrl);

  // Set locale cookie for future visits (if not already set)
  if (!cookieLocale) {
    response.cookies.set(LOCALE_COOKIE_NAME, detectedLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
    });
  }

  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
