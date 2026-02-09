// Server-only environment validation for go-live readiness (fail fast without logging secrets).
import "server-only";

import { logWarn } from "@/lib/observability/logger";

const envLabel =
  process.env.APP_ENV ??
  (process.env.NODE_ENV === "production" ? "production" : "staging");

const allowedAppEnvs = new Set([
  "production",
  "staging",
  "development",
  "local",
  "test",
]);
if (process.env.APP_ENV && !allowedAppEnvs.has(process.env.APP_ENV)) {
  // Warn about unexpected APP_ENV values without leaking any secrets.
  logWarn("APP_ENV has an unexpected value.", { appEnv: process.env.APP_ENV });
}

const missing: string[] = [];

if (!process.env.DATABASE_URL) {
  missing.push("DATABASE_URL");
}

const hasAuthSecret =
  Boolean(process.env.AUTH_SECRET) || Boolean(process.env.NEXTAUTH_SECRET);
if (!hasAuthSecret) {
  missing.push("AUTH_SECRET or NEXTAUTH_SECRET");
}

const hasAuthUrl = Boolean(process.env.AUTH_URL) || Boolean(process.env.NEXTAUTH_URL);
if (!hasAuthUrl) {
  missing.push("AUTH_URL or NEXTAUTH_URL");
}

const sentryEnvLabel =
  process.env.APP_ENV ??
  (process.env.NODE_ENV === "production" ? "production" : undefined);
const requiresSentryDsn =
  sentryEnvLabel === "production" || sentryEnvLabel === "staging";

if (requiresSentryDsn && !process.env.SENTRY_DSN) {
  // Warn without printing the DSN or any sensitive context.
  logWarn("SENTRY_DSN is missing; Sentry error reporting is disabled.", {
    env: sentryEnvLabel,
  });
}

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables for ${envLabel}: ${missing.join(", ")}.`,
  );
}
