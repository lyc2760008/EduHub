// Server-only environment validation for go-live readiness (fail fast without logging secrets).
import "server-only";

const envLabel =
  process.env.APP_ENV ??
  (process.env.NODE_ENV === "production" ? "production" : "staging");

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

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables for ${envLabel}: ${missing.join(", ")}.`,
  );
}
