<!--
  QA Template: Step 22.2 Admin Invite/Resend (Parent Magic Link)

  Purpose:
  - Provide a single place for QA to record staging validation results for Step 22.2.
  - Keep this doc safe to share: never paste secrets, tokens, raw emails, or inbox screenshots.
-->
# Step 22.2 QA Report (Admin Invite/Resend, Parent Magic Link) - STAGING

## Metadata
- STAGING base URL: `<fill>`
- Commit SHA: `<fill>`
- Date/Time (America/Edmonton): `<fill>`
- QA operator: `<fill>`
- Tenant slug tested: `<fill>`

## Scope Summary
- Feature: Admin can send/resend a parent magic sign-in link from Student Detail -> Parents.
- Non-goals (automation): Do not depend on real email inbox delivery or token clicking.

## Manual Results (Placeholders)

### Admin UX
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Button present on Student Detail -> Parents row actions |  |  |  |
| Missing parent email disables action and shows helper text |  |  |  |
| Row-level loading state only (no full-page lock) |  |  |  |
| Success toast is admin-friendly (no secrets) |  |  |  |
| Failure toast is admin-friendly (no secrets) |  |  |  |

### Security (P0)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Non-admin cannot trigger invite/resend (UI blocked and/or 401/403) |  |  |  |
| Cross-tenant attempts are blocked (404/403, no leakage) |  |  |  |
| No token/email/secret leakage in server logs (spot-check) |  |  |  |

## Telemetry Notes (Placeholders)
- Sentry (errors): `<fill>`
- Logs (PII/tokens redaction spot-check): `<fill>`
- Correlation IDs (x-request-id present where expected): `<fill>`

## E2E Iteration Log
<!--
  Keep this section factual and compact.
  Example row:
  - 2026-02-10 14:05: pnpm e2e:full (fail) - <spec> - <root cause> - <fix PR/commit>
-->
- `<timestamp>`: `pnpm e2e:full` (pass/fail) - `<notes>`

## Issues + Fixes
| Severity | Title | Root Cause | Fix | Evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## QA Decision
- Decision: `<GO / NO-GO>`
- Rationale: `<fill>`

