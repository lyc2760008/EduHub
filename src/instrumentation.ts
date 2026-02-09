// Next.js instrumentation hook loads the correct Sentry config per runtime.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    return;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Delegate request error capture to Sentry's helper for consistent context.
export const onRequestError = Sentry.captureRequestError;
