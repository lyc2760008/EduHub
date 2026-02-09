<!-- DevOps incident triage runbook for observability events. -->
# Incident Triage (Observability)

## Severity Levels
- P0: RBAC/tenant isolation breach, confirmed data leak, or active credential exposure.
- P1: Crash loops, widespread auth failures, or major feature outage in production.
- P2: Degraded performance, partial feature impact, or isolated errors with viable workaround.

## Immediate Actions (First 15 Minutes)
- Disable Sentry capture by unsetting `SENTRY_DSN` (staging or production) if PII leakage is suspected.
- Roll back the last deploy if a new release introduced the issue.
- Rotate any potentially exposed tokens or secrets if leakage is suspected.
- Announce incident in the on-call channel with scope, environment, and time.

## Tenant Isolation Breach Check
Confirm whether it is a real breach or a false alarm:
- Verify tenant identifiers in the event payload (tenant slug, request path, headers).
- Check if the request context matches the same tenant as the authenticated session.
- Reproduce with two known tenants to confirm cross-tenant access is possible.
- If the data crosses tenants in the same session context, treat as P0.

## Evidence to Capture
- Sentry event IDs (errors + breadcrumbs).
- Release SHA and environment (`staging` or `production`).
- Timestamp (UTC) and affected user/tenant IDs (redacted where required).
- Screenshots or logs showing the issue (sanitize before sharing).

## Containment / Recovery Checklist
- Confirm DSN disabled or sampling reduced if noise is blocking triage.
- Confirm rollback completed and release version matches the intended rollback target.
- Verify that new events match expected environment + release tags.
- Document root cause, fixes, and follow-up actions.
