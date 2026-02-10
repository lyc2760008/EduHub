<!-- Purpose: document required environment variables for staging/production without leaking secrets. -->
# Environment Variables (Staging + Production)

This document lists the **server-side** environment variables required to run EduHub in staging and production. It does not include secrets, and it must stay safe to share.

**Principles**
- Never commit `.env.staging` or `.env.production`.
- Do not log secret values (only log variable names).
- Rotate secrets on schedule and after any suspected exposure.

## Required Variables

| Name | Required (Staging) | Required (Prod) | Description | Safe Example | Notes |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Yes | Postgres connection string used by Prisma. | `postgresql://eduhub_user:REDACTED@db.example.com:5432/eduhub?sslmode=require` | Use least-privileged DB user. |
| `AUTH_SECRET` | Yes (or `NEXTAUTH_SECRET`) | Yes (or `NEXTAUTH_SECRET`) | Auth.js/NextAuth secret for signing. | `REDACTED_32+_CHARS` | Prefer `AUTH_SECRET`, keep `NEXTAUTH_SECRET` for compatibility. |
| `AUTH_URL` | Yes (or `NEXTAUTH_URL`) | Yes (or `NEXTAUTH_URL`) | Public base URL for Auth.js callbacks. | `https://staging.eduhub.example.com` | Use the exact public origin. |
| `SMTP_HOST` | Yes | Yes | SMTP host for transactional email. | `smtp.mailprovider.com` | Used for parent magic links. |
| `SMTP_PORT` | Yes | Yes | SMTP port. | `587` | Match your provider settings. |
| `SMTP_USER` | Yes | Yes | SMTP username. | `smtp-user` | Store securely in secrets manager. |
| `SMTP_PASSWORD` | Yes | Yes | SMTP password. | `REDACTED` | Store securely in secrets manager. |
| `SMTP_SECURE` | Yes | Yes | Use TLS for SMTP (`true`/`false`). | `true` | Use `true` for port 465. |
| `EMAIL_FROM` | Yes | Yes | From address for magic link emails. | `EduHub <no-reply@eduhub.example.com>` | Must match SMTP sender. |
| `TENANT_BASE_DOMAIN` | Recommended | Yes (recommended) | Base domain used to resolve tenant subdomains. | `eduhub.example.com` | Required for subdomain routing in production. |
| `TENANT_DEV_BASE_DOMAIN` | Optional | Optional | Dev-only base domain for local subdomains. | `lvh.me` | Used for local testing only. |
| `APP_ENV` | Optional | Optional | Labels the deployment environment. | `staging` | Used in env validation error messages. |
| `NODE_ENV` | Optional | Optional | Node runtime mode. | `production` | Default is `production` inside Docker image. |
| `PORT` | Optional | Optional | HTTP port for the Next.js server. | `3000` | Docker defaults to 3000. |

## Optional Variables (Operational/Seed)

| Name | Required | Description | Safe Example | Notes |
| --- | --- | --- | --- | --- |
| `SEED_*` | No | Seed-only defaults for local/demo setup. | `SEED_OWNER_EMAIL=owner@demo.local` | Do not set in production. |
| `E2E_*` | No | Playwright E2E automation settings. | `E2E_BASE_URL=http://e2e.lvh.me:3000` | QA-only. |
| `MAGIC_LINK_TTL_MINUTES` | No | Magic link time-to-live in minutes. | `15` | Defaults to 15 minutes. |
| `AUTH_RATE_LIMIT_EMAIL_MAX` | No | Max magic link requests per email in the window. | `3` | Defaults to 3. |
| `AUTH_RATE_LIMIT_EMAIL_WINDOW_MINUTES` | No | Email rate limit window in minutes. | `15` | Defaults to 15 minutes. |
| `AUTH_RATE_LIMIT_IP_MAX` | No | Max magic link requests per IP in the window. | `10` | Defaults to 10. |
| `AUTH_RATE_LIMIT_IP_WINDOW_MINUTES` | No | IP rate limit window in minutes. | `60` | Defaults to 60 minutes. |

## Validation Behavior

Server-side validation runs on app startup from `src/lib/env/server.ts` and fails fast when required variables are missing. Errors include the **variable name** and the **environment label** only.

## Suggested Local Files (Do Not Commit)

` .env.staging ` (example placeholders only):

```ini
# Purpose: staging environment variables for Docker Compose.
APP_ENV=staging
NODE_ENV=production
PORT=3000
TENANT_BASE_DOMAIN=staging.eduhub.example.com
TENANT_DEV_BASE_DOMAIN=lvh.me
DATABASE_URL=postgresql://eduhub_user:REDACTED@db.example.com:5432/eduhub_staging?sslmode=require
AUTH_SECRET=REDACTED_32+_CHARS
AUTH_URL=https://staging.eduhub.example.com
SMTP_HOST=smtp.mailprovider.com
SMTP_PORT=587
SMTP_USER=REDACTED
SMTP_PASSWORD=REDACTED
SMTP_SECURE=true
EMAIL_FROM=EduHub <no-reply@eduhub.example.com>
```

` .env.production ` (example placeholders only):

```ini
# Purpose: production environment variables for Docker Compose.
APP_ENV=production
NODE_ENV=production
PORT=3000
TENANT_BASE_DOMAIN=eduhub.example.com
DATABASE_URL=postgresql://eduhub_user:REDACTED@db.example.com:5432/eduhub?sslmode=require
AUTH_SECRET=REDACTED_32+_CHARS
AUTH_URL=https://eduhub.example.com
SMTP_HOST=smtp.mailprovider.com
SMTP_PORT=587
SMTP_USER=REDACTED
SMTP_PASSWORD=REDACTED
SMTP_SECURE=true
EMAIL_FROM=EduHub <no-reply@eduhub.example.com>
```
