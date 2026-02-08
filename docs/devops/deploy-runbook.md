# EduHub Deployment Runbook (Vercel + Neon)

This runbook documents the standard, repeatable process to deploy **staging** and **production** for EduHub (Next.js + Prisma + Neon + Vercel).

---

## 0) Environment map (how things connect)

### Vercel Projects
- **Staging project** (example): `eduhub-staging`
  - Deploys from branch: `staging`
  - Uses its own Vercel Environment Variables (Production scope in that project)
  - Uses **staging Neon database**
- **Production project** (example): `eduhub-prod`
  - Deploys from branch: `main`
  - Uses its own Vercel Environment Variables (Production scope in that project)
  - Uses **production Neon database**

### Neon
- Staging Neon DB is separate from Prod Neon DB (recommended).
- Tables may exist but be empty until you seed and/or start creating records via the app.

### Tenant routing (critical)
The app is multi-tenant. Tenants must be resolvable by one of:
- subdomain: `tenant.<domain>`
- path slug: `/:tenantSlug/...` or `/t/:tenantSlug/...` (depends on your routing)
- headers (internal usage)

If tenant isn’t resolved, APIs may return:
> `Tenant not resolved. Use subdomain (tenant.<domain>), /t/:slug, or headers.`

---

## 1) Standard release flow (ALWAYS)

### 1.1 Local pre-flight (before pushing)
From repo root:

```bash
pnpm install
pnpm prisma generate
pnpm build
```

If your repo has these scripts, also run:

```bash
pnpm lint
pnpm test
pnpm e2e:full
```

### 1.2 Deploy to STAGING (push to `staging` branch)
STAGING is tied to branch `staging`.

```bash
git checkout staging
git pull

# merge or cherry-pick your feature changes into staging
# (recommended: PR -> staging, but direct push is OK for small teams)

git add -A
git commit -m "feat/fix: <meaningful message>"
git push origin staging
```

**What happens next**
- Vercel auto-builds and deploys the staging project from `staging`.
- Confirm build success in Vercel → Project → Deployments.
- Smoke test in browser:
  - Admin pages under a known tenant slug
  - Parent login route under a known tenant slug
  - Creating a Center / basic CRUD works

### 1.3 Promote to PRODUCTION (merge `staging` → `main`)
After staging is validated:

```bash
git checkout main
git pull
git merge staging
git push origin main
```

**What happens next**
- Vercel auto-builds and deploys the production project from `main`.
- Smoke test production (same checklist as staging).

---

## 2) Prisma migrations (schema changes)

### 2.1 When you change Prisma schema locally
If you changed `prisma/schema.prisma`, you must create a migration:

```bash
pnpm prisma migrate dev --name <short_name>
```

Then commit:
- `prisma/migrations/**`
- updated Prisma client artifacts if applicable (usually generated in build)

### 2.2 Apply migrations to STAGING Neon DB
After code is merged to `staging` (or before, if you prefer), apply migrations to the **staging database**.

**Option A (recommended): run from your machine using STAGING DATABASE_URL**
1) Load staging env locally (choose ONE method below)
   - Use your password manager / `.env.local` (temporary)  
   - Or copy the STAGING `DATABASE_URL` from Vercel project env vars
2) Run:

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
```

You should see “Database schema is up to date”.

### 2.3 Apply migrations to PRODUCTION Neon DB
Same as staging, but using **production DATABASE_URL**:

```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
```

**Important**
- `migrate deploy` is forward-only. Rolling back DB schema is not automatic.
- If you need rollback, use Neon branch/restore strategy or a new “revert migration” migration.

---

## 3) Seeding data (seed.ts)

Your repo contains a `seed.ts` used to create tenants + demo users + sample data.
Neon will show tables but they may be empty until you seed or create records through the UI.

### 3.1 Seed STAGING (first time, or when DB is empty)
**Goal:** make sure the tenant slug(s) you want exist (e.g., `pilot-staging`) and that login works.

1) Confirm you are pointing to **staging** DB:
   - `DATABASE_URL` must be the staging Neon connection string

2) Run seed (choose ONE that matches your repo setup):

**Option A: Prisma seed (if `prisma.seed` is configured in package.json)**
```bash
pnpm prisma db seed
```

**Option B: run seed.ts directly (if your repo uses tsx)**
```bash
pnpm tsx seed.ts
```

3) Verify in Neon console:
- Tables → `Tenant` should contain your tenant row(s)
- `User` and `TenantMembership` should contain seeded accounts

### 3.2 Seed PROD
Only do this if you intentionally want initial production demo data.
Typically production starts minimal (just the first real tenant + owner).

Same commands as staging, but with **production DATABASE_URL**.

---

## 4) Tenant provisioning (creating new tenants later)

When you need a new tenant in staging/prod:
- Either create it via an internal admin/provisioning flow (if built),
- Or run a provisioning script/seed with env vars.

Reference: `docs/devops/tenant-provisioning.md` (or your provisioning doc).

---

## 5) Deploying new changes (day-to-day checklist)

### 5.1 Most common change (no DB change)
1) Make code changes in your feature branch
2) Local pre-flight:
   ```bash
   pnpm install
   pnpm prisma generate
   pnpm build
   ```
3) Merge into `staging` (deploy happens automatically)
4) Smoke test staging
5) Merge `staging` → `main` (deploy happens automatically)
6) Smoke test production

### 5.2 Change includes Prisma schema migration
1) Create migration locally:
   ```bash
   pnpm prisma migrate dev --name <name>
   ```
2) Commit migration files
3) Deploy to staging (push `staging`)
4) Apply migrations to staging DB:
   ```bash
   pnpm prisma migrate deploy
   pnpm prisma migrate status
   ```
5) Smoke test staging
6) Promote to production (merge to `main`)
7) Apply migrations to prod DB:
   ```bash
   pnpm prisma migrate deploy
   pnpm prisma migrate status
   ```
8) Smoke test production

---

## 6) Monitoring & logs

### Vercel logs
Use Vercel → Project → Logs to see:
- API 4xx/5xx
- Tenant resolution errors
- Prisma errors (connection / query / migration)

### Neon visibility
Neon console → Tables / SQL Editor:
- confirm data exists
- run quick sanity queries (counts, recent rows)

Reference: `docs/devops/observability.md` (or your observability doc).

---

## 7) Rollback strategy (when something breaks)

### 7.1 Code rollback (fastest)
- Vercel → Deployments → pick last known-good → **Redeploy**
- Also revert the bad commit in Git to prevent reintroducing it.

### 7.2 Database rollback (careful)
Prisma migrations are not auto-reversible.
Options:
- Neon restore point (Backup/Restore)
- Neon branch strategy (promote/rollback branches)
- Apply a follow-up migration that reverts schema changes (manual approach)

---

## 8) Common issues & fixes

### A) Build fails: “Root Directory … does not exist”
- Vercel Project Settings → Build & Deployment → Root Directory
  - If your repo is not a monorepo: leave blank (repo root)
  - If it is a monorepo: set it to the correct folder that contains `package.json`

### B) App works locally but not on Vercel (tenant not resolved)
Symptom:
- API returns `Tenant not resolved...`

Checklist:
- Confirm you are visiting a tenant-resolvable URL:
  - `https://<vercel-domain>/<tenantSlug>/...` (or `/t/<slug>/...` depending on your app)
- Confirm client calls to `/api/*` include tenant context (path/header/cookie as your app expects)
- Confirm the tenant exists in Neon (`Tenant` table has the slug you are using)

### C) Tables exist but are empty in Neon
- This is expected on a new DB.
- Run seeding (Section 3) or create data via UI.

### D) “Something went wrong” on dashboards / reports
- Check Vercel logs for the failing endpoint (often `/api/reports/*`)
- Confirm tenant context is resolved for that request
- Confirm required rows exist (centers/sessions/attendance may be empty)

---

## 9) Quick smoke test checklist (staging + prod)

- ✅ Can open Admin pages under a tenant slug
- ✅ Can login (Owner/Admin)
- ✅ Can create a Center
- ✅ Can list Centers after creation
- ✅ Can access Parent login route under the same tenant slug
- ✅ No recurring `400/500` spam in Vercel logs
- ✅ Neon tables show expected rows after CRUD

---

## 10) Related docs
- `docs/devops/vercel-neon-deploy.md`
- `docs/devops/seeding-staging.md`
- `docs/devops/tenant-provisioning.md`
- `docs/devops/observability.md`
