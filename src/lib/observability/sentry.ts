// Shared Sentry config helpers keep release/environment tagging consistent.
const DEFAULT_TRACES_SAMPLE_RATE = 0;

function clampSampleRate(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function getSentryEnvironment() {
  return (
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.APP_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function getSentryRelease() {
  return (
    process.env.SENTRY_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    "unknown"
  );
}

export function getSentryTracesSampleRate() {
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (!raw) return DEFAULT_TRACES_SAMPLE_RATE;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TRACES_SAMPLE_RATE;

  return clampSampleRate(parsed);
}

export function getSentryDsn() {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";
}
