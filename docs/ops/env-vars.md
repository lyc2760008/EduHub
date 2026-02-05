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
```
