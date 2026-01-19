import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

// Check if building for VM staging (Docker)
const useBasePath = process.env.USE_BASE_PATH === "true";

const nextConfig: NextConfig = {
  // Only use standalone + basePath when building for Docker (VM staging)
  // - Local dev: localhost:3000 (no basePath)
  // - Vercel prod: stockandcryptotracker.com (no basePath)
  // - VM staging: nxserver.../front-end (with basePath)
  ...(useBasePath && {
    output: "standalone",
    basePath: "/front-end",
  }),

  // Note: Vercel subdomain redirect removed - now handled by Vercel domain settings (308 redirect)
};

export default withNextIntl(nextConfig);
