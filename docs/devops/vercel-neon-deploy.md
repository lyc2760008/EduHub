<!-- Purpose: Step 21.2 deployment runbook for Vercel + Neon (staging -> production). -->
# Vercel + Neon Deployment Runbook (Staging -> Production)

## Goal
Deploy EduHub to:
- Vercel (staging + production as separate Vercel projects)
- Neon Postgres (staging + production as isolated DBs)
- Wildcard subdomains for multi-tenant routing

This doc is the single source of truth for Step 21.2.

## References (Step 21.0)
- docs/ops/env-vars.md
- docs/ops/db-runbook.md
- docs/ops/tenant-provisioning.md
- docs/ops/observability.md
- docs/ops/deployment.md

---

## Repo & Runtime Inventory (Phase 0 - must do first)

### What to confirm (record results in deploy logs)
1. Package manager
- Check `package.json` scripts and lockfiles:
  - `pnpm-lock.yaml` => pnpm
  - `package-lock.json` => npm

2. Node version
- If repo has `.nvmrc` or `engines.node`, follow it.
- If not, standardize on Node 20.x for Vercel.

3. Next.js / runtime
- Confirm Next.js version from `package.json`.
- Confirm no route handlers that touch DB run on Edge runtime.

4. Prisma
- Confirm `prisma/schema.prisma` exists.
- Confirm migrations are applied with `prisma migrate deploy` in staging/prod.

5. Env vars expected by code
- Confirm required variables from docs/ops/env-vars.md and `src/lib/env/server.ts`.

### Inventory commands (PowerShell)
```powershell
# versions
node -v
pnpm -v

# commit
git status
git rev-parse HEAD

# preflight scan (Edge runtime + Prisma checks)
pnpm devops:preflight
```

---

## Required Env Vars (names only)
- DATABASE_URL
- AUTH_SECRET
- NEXTAUTH_SECRET
- AUTH_URL
- NEXTAUTH_URL

## Recommended Env Vars (names only)
- TENANT_BASE_DOMAIN
- APP_ENV
- NODE_ENV
- PORT

---

## Operator Commands (Windows PowerShell)

### Preflight (repo sanity)
```powershell
pnpm devops:preflight
```

### Prisma migrations using Neon DIRECT_URL
```powershell
# Set DIRECT_URL in your shell (do not paste secrets into git logs)
$env:DIRECT_URL = "<NEON_DIRECT_URL>"

pnpm devops:migrate:deploy
```

### Pilot tenant provisioning using Neon DIRECT_URL
```powershell
# Set DIRECT_URL in your shell (do not paste secrets into git logs)
$env:DIRECT_URL = "<NEON_DIRECT_URL>"

pnpm devops:provision:tenant -- `
  --tenantSlug pilot-staging `
  --tenantName "Pilot Staging" `
  --ownerEmail owner@pilot-staging.example.com `
  --ownerName "Pilot Owner" `
  --timeZone America/Edmonton `
  --supportEmail support@pilot-staging.example.com `
  --supportPhone "+1 555 123 4567"
```

### Vercel CLI placeholders (human runs)
```powershell
# Login (if needed)
vercel login

# Link the repo to the correct project
vercel link --project eduhub-staging
vercel link --project eduhub-production

# Set env vars in Vercel (names only; values from docs/ops/env-vars.md)
vercel env add DATABASE_URL
vercel env add AUTH_SECRET
vercel env add AUTH_URL
vercel env add TENANT_BASE_DOMAIN

# Deploy (use --prod only for production)
vercel deploy
vercel deploy --prod
```

---

## What Codex Does vs What Human Does

**Codex (repo-side only)**
- Adds preflight, migration, and provisioning helper scripts.
- Ensures a safe health endpoint exists for deploy checks.
- Updates docs and deploy log templates.

**Human operator**
- Creates Neon projects (staging + production) and obtains DIRECT_URL/DATABASE_URL.
- Creates Vercel projects and configures env vars.
- Runs preflight, migrations, and provisioning scripts.
- Records outcomes in deploy logs.
