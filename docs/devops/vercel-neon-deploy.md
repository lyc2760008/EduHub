<!-- Purpose: Canonical DevOps reference for EduHub on Vercel + Neon (staging + production). -->
# EduHub on Vercel + Neon (Staging + Production)

## What this doc is for
This document defines the **infra setup + invariants** for EduHub running on:
- **Vercel** (two separate projects: staging + production)
- **Neon Postgres** (two isolated databases)
- **Path-based tenant routing** (e.g. `/{tenantSlug}/...`)

For the step-by-step “how to deploy new code changes”, see:
- `docs/devops/deploy-runbook.md`

---

## Current architecture (source of truth)

### Environments
**STAGING**
- Vercel Project: `eduhub-staging`
- Git Branch: `staging`
- Neon DB: staging-only (separate project/branch; no prod data)
- APP_ENV: `staging`

**PRODUCTION**
- Vercel Project: `eduhub-production` (or `eduhub`)
- Git Branch: `main`
- Neon DB: production-only (separate project/branch; no staging data)
- APP_ENV: `production`

### Tenant routing
- Canonical routing: `/{tenantSlug}/...`
  - Example: `/pilot-staging/admin`
  - Example: `/pilot/parent/login`

> Note: Wildcard subdomains can be added later when you own a domain.
> For now, Vercel-provided domains (`*.vercel.app`) work fine with **path-based** tenants.

---

## Golden rules (non-negotiables)
- Staging and production must remain **isolated** (separate Vercel projects + separate Neon DBs).
- Never commit secrets. Use **Vercel Environment Variables** and local `.env.local`.
- Prisma migrations in production must be **repeatable** and **auditable**.
- Any environment variable change requires a **redeploy**.
- Use deploy logs for releases (commit + URLs + migration output).

---

## Required environment variables (names only)
The exact list lives in `docs/ops/env-vars.md`. At minimum:

### Database
- `DATABASE_URL` (runtime; usually pooled)
- `DIRECT_URL` (migration; usually direct / non-pooled) — if supported/used

### Auth
- `AUTH_SECRET` (or `NEXTAUTH_SECRET` if your code expects it)
- `AUTH_URL` (or `NEXTAUTH_URL` if your code expects it)

### Environment labeling
- `APP_ENV` (staging/prod)

> `server.ts` behavior:  
> `APP_ENV` overrides the label. If not set, `NODE_ENV === "production"` labels as `production`.  
> On Vercel, previews can also have `NODE_ENV="production"`, so **APP_ENV must be set explicitly**.

---

## Vercel configuration invariants
- **Root Directory**: blank (repo root is the Next.js project)
- **Build Command**:
  - Recommended for safety: `pnpm prisma generate && pnpm prisma migrate deploy && pnpm build`
- **Install Command**:
  - `pnpm install --frozen-lockfile`
- Output Directory: default (do not override unless you change Next build output)

---

## Neon configuration invariants
- Staging and production must never share the same Neon project/branch unless explicitly documented.
- Use **pooled** string for runtime and **direct** string for migrations (where possible).
- For production schema changes:
  - Have a clear restore strategy (Neon restore window / branch restore).

---

## Operational references
- `docs/ops/env-vars.md` — env var names + meaning
- `docs/ops/db-runbook.md` — backup/restore/rollback concepts
- `docs/ops/tenant-provisioning.md` — how to provision a tenant + initial owner
- `docs/devops/seeding-staging.md` — staging seed workflow (repeatable)
- `docs/ops/observability.md` — minimal health/logging expectations
