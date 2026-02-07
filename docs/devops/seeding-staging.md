# Seeding the Staging Neon Database

This workflow seeds the staging Neon database from your local machine using `prisma/seed.ts`. It is safe to re-run because the seed uses upserts.

**Environment Variables**
1. `DATABASE_URL` is required and must point to the Neon staging database.
2. `SEED_DEFAULT_PASSWORD` is required and is used for all demo accounts.
3. `SEED_DEMO_TENANT_SLUG` should be `pilot-staging` for staging.
4. `SEED_DEMO_TENANT_NAME` should be `Pilot Staging` for staging.
5. `SEED_SECOND_TENANT_SLUG` is optional and defaults to `acme-staging` in the helper scripts.
6. `SEED_SECOND_TENANT_NAME` is optional and defaults to `Acme Staging` in the helper scripts.
7. `SEED_RUN_MIGRATE=1` is optional and runs `prisma migrate deploy` before seeding.
8. `DIRECT_URL` is optional and used only when `SEED_RUN_MIGRATE=1` (defaults to `DATABASE_URL` in the helper scripts).

**PowerShell (Windows)**
1. Run the helper script and provide values when prompted.
```powershell
pwsh -File scripts/seed-neon-staging.ps1
```

**Bash (macOS/Linux)**
1. Run the helper script and provide values when prompted.
```bash
bash scripts/seed-neon-staging.sh
```

**Manual Commands (if you prefer to set env vars yourself)**
```powershell
$env:DATABASE_URL="postgresql://...neon..."
$env:DIRECT_URL="postgresql://...neon..."  # optional, only needed when running migrations
$env:SEED_DEFAULT_PASSWORD="YourTempPassword!"
$env:SEED_DEMO_TENANT_SLUG="pilot-staging"
$env:SEED_DEMO_TENANT_NAME="Pilot Staging"
$env:SEED_SECOND_TENANT_SLUG="acme-staging"
$env:SEED_SECOND_TENANT_NAME="Acme Staging"
# optional
$env:SEED_RUN_MIGRATE="1"

pnpm db:migrate:deploy
pnpm db:seed
```

**Verify in Neon**
1. Confirm tables like `Tenant`, `User`, `Center`, `Program`, `Group`, `Student`, and `Session` are populated.
2. Ensure the tenant slug `pilot-staging` exists in `Tenant`.

**Verify in the App**
1. `https://eduhub-staging.vercel.app/pilot-staging/admin`
2. `https://eduhub-staging.vercel.app/pilot-staging/admin/centers`
3. `https://eduhub-staging.vercel.app/pilot-staging/parent/login`

**Important**
Do not auto-seed during Vercel builds. Run the seed manually when you need to refresh staging data.
