// Server-side Sentry initialization with safe defaults + redaction hooks.
import * as Sentry from "@sentry/nextjs";

import { redactSentryEvent } from "./src/lib/observability/redaction";
import {
  getSentryDsn,
  getSentryEnvironment,
  getSentryRelease,
  getSentryTracesSampleRate,
} from "./src/lib/observability/sentry";

const dsn = getSentryDsn();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: getSentryEnvironment(),
  release: getSentryRelease(),
  sendDefaultPii: false,
  tracesSampleRate: getSentryTracesSampleRate(),
  beforeSend(event) {
    return redactSentryEvent(event);
  },
});
