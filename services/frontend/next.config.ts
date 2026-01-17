import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Redirect old Vercel subdomain to primary domain
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "stock-and-crypto-tracker.vercel.app",
          },
        ],
        destination: "https://stockandcryptotracker.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
