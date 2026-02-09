// Next.js config wrapped with next-intl plugin (no locale routing).
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const sentryRelease =
  process.env.SENTRY_RELEASE ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_COMMIT_SHA ??
  "unknown";
const shouldUploadSourcemaps =
  Boolean(process.env.SENTRY_AUTH_TOKEN) &&
  Boolean(process.env.SENTRY_ORG) &&
  Boolean(process.env.SENTRY_PROJECT);

const nextConfig: NextConfig = {
  /* config options here */
  // Expose non-secret envs for client-side Sentry tagging and DSN wiring.
  env: {
    NEXT_PUBLIC_APP_ENV:
      process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
  },
  // Allow local tenant subdomains in dev so /_next assets load without warnings.
  allowedDevOrigins: [
    // Next.js expects hostnames (no protocol) and supports wildcard subdomains.
    "localhost",
    "127.0.0.1",
    "demo.lvh.me",
    "*.lvh.me",
  ],
  turbopack: {
    // Explicitly set the project root to avoid Turbopack picking a higher-level lockfile
    root: __dirname,
  },
};

// Apply next-intl to enable request-based message loading via src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin();
const intlConfig = withNextIntl(nextConfig);

// Conditionally wrap with Sentry only when sourcemap upload credentials are present.
const sentryConfig = shouldUploadSourcemaps
  ? withSentryConfig(intlConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      release: { name: sentryRelease },
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      silent: true,
    })
  : intlConfig;

export default sentryConfig;
