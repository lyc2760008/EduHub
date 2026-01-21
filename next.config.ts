// Next.js config wrapped with next-intl plugin (no locale routing).
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allow local tenant subdomains in dev so /_next assets load without warnings.
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://demo.lvh.me:3000",
  ],
  turbopack: {
    // Explicitly set the project root to avoid Turbopack picking a higher-level lockfile
    root: __dirname,
  },
};

// Apply next-intl to enable request-based message loading via src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
