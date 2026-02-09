<!-- Observability docs for Sentry and request ID instrumentation. -->
# Observability (Sentry + Request IDs)

## Purpose
- Errors: server + client error reporting.
- Key transactions: only when performance tracing is explicitly enabled (see Source Maps + Tracing).
- Request correlation uses `x-request-id` for safe, cross-request tracing.

## Environment Model
- `APP_ENV=staging` or `APP_ENV=production` drives Sentry environment tagging.
- Local/dev uses `NODE_ENV` as a fallback when `APP_ENV` is unset.

## Required Environment Variables (Names Only)
Required for staging/production:
- `SENTRY_DSN` (public DSN; required to send events)
- `APP_ENV` (`staging` or `production` for environment tagging)

Optional (only needed to upload source maps via build integration):
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

Optional tuning:
- `SENTRY_TRACES_SAMPLE_RATE` (float `0` to `1`, defaults to `0`)

## Tagging Rules
- Environment: `APP_ENV` (falls back to `NODE_ENV` when needed).
- Release: `SENTRY_RELEASE` → `VERCEL_GIT_COMMIT_SHA` → `GIT_COMMIT_SHA` → `unknown`.
- Expectation: on Vercel, releases should map to the Vercel deploy SHA.

## Request ID Behavior
- The Next.js proxy handler sets `x-request-id` when missing and echoes it on the response.
- Sentry events add `request_id` from the request headers when available.

## PII/Secret Safety Checklist (Non-Negotiable)
- `sendDefaultPii` is disabled.
- Sensitive headers are redacted: `authorization`, `cookie`, `set-cookie`, tokens, access codes, passwords, secrets, API keys.
- Request cookies and request bodies are stripped from Sentry events.
- User context is removed from Sentry events to avoid PII capture.
- Never capture: access codes, auth tokens (bearer/jwt), passwords, cookies, session IDs, secrets, or any credential-like fields.

## Source Maps + Tracing (Optional)
- Source map upload is enabled only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all set.
- Uploaded source maps are deleted after upload to avoid public exposure.
- Performance tracing is disabled by default and only enabled when `SENTRY_TRACES_SAMPLE_RATE` is a non-zero value.
- Approach: build-time upload via Next.js Sentry integration when env vars are present; otherwise source maps are not uploaded.

## Staging Verification
1. Set `APP_ENV=staging` and `SENTRY_DSN` in the staging environment.
2. Sign in as an Owner/Admin.
3. Call `GET /api/__debug/sentry-test`.
   Note: `__debug` is routed to `/api/debug/sentry-test` via a rewrite.
4. Confirm a `Sentry staging test error` event appears in Sentry.
5. Validate tags:
   - `environment` matches `staging`.
   - `release` matches the deploy commit.
   - `request_id` is present in tags/extra when available.

## Required Commands (No Tests)
- `pnpm lint`
- `pnpm typecheck`
