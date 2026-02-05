<!-- Purpose: document minimal observability expectations for pilot go-live. -->
# Observability Basics

This document captures minimal observability guidance for a pilot go-live. It does not introduce new monitoring services.

## Logging
- Current server errors log via `console.error` in API routes and server components.
- **Do not log secrets** (tokens, passwords, `DATABASE_URL`).
- Prefer logging only IDs and high-level context (tenant ID, route name).

## Request Correlation
- No request ID middleware exists in the repo today.
- If request IDs are needed, prefer adding them at the reverse proxy or gateway (e.g., `X-Request-Id`).

## Error Boundaries
- No `error.tsx` boundaries are present in the App Router today.
- The UI relies on inline error states and route-level error messages.

## Audit Log Retention (Guidance)
- Audit events are stored in the `AuditEvent` table.
- Recommended pilot retention window: **30–90 days**.
- **TODO:** define a long-term retention strategy and archival process.

## Health Endpoint
- `GET /api/health` returns `status: ok` when the DB ping succeeds.
- Use this endpoint for container health checks and uptime monitoring.
