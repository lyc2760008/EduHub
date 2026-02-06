<!--
Step 21.2 (DevOps) — EduHub deploy to Vercel + Neon (Staging → Production)
Scope: Deployment + infra config + runbooks/scripts only. No product feature work.
Non-negotiables:
- Never commit secrets
- Preserve tenant isolation + server-side RBAC as-is
- Keep changes minimal and reversible
- Record every operator command in deploy logs
-->

# Vercel + Neon Deployment Runbook (Staging → Production)

## Goal
Deploy EduHub to:
- Vercel (STAGING + PRODUCTION as separate Vercel projects)
- Neon Postgres (STAGING + PRODUCTION as isolated DBs)
- Wildcard subdomains for multi-tenant routing

This doc is the “single source of truth” for Step 21.2.

---

## Repo & Runtime Inventory (Phase 0 — MUST DO FIRST)

### What to confirm (record results in deploy logs)
1) **Package manager**
- Check `package.json` scripts and lockfiles:
  - `pnpm-lock.yaml` => pnpm
  - `package-lock.json` => npm

2) **Node version**
- If repo has `.nvmrc` / `engines.node`, follow it.
- If not, standardize on **Node 20.x** for Vercel unless the repo explicitly requires different.

3) **Next.js / runtime**
- Confirm Next.js version from `package.json`
- Confirm whether any route handlers that touch DB run on **Edge** (not allowed for Postgres connections)

4) **Prisma**
- Confirm `prisma/schema.prisma` exists
- Confirm how migrations are applied today:
  - ✅ recommended for staging/prod: `prisma migrate deploy`
  - ❌ avoid in prod: `prisma migrate dev`

5) **Env vars expected by code**
- Confirm via env validation (e.g., `src/lib/env/server.ts`) and `docs/env-vars.md`

### Inventory commands (copy/paste)
```bash
# versions
node -v
pnpm -v

# commit
git status
git rev-parse HEAD

# detect Edge runtime declarations (any DB code must NOT be Edge)
rg -n "export\s+const\s+runtime\s*=\s*['\"]edge['\"]|runtime\s*:\s*['\"]edge['\"]|runtime\s*=\s*['\"]edge['\"]" app src || true

# check middleware existence (middleware is Edge by default; must not touch DB)
ls -la middleware.* 2>/dev/null || true
rg -n "middleware" app src || true

# prisma sanity (run once DATABASE_URL is set)
pnpm prisma -v
pnpm prisma migrate status || true
