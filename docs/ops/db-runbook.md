<!-- Purpose: define safe migration, backup, restore, and rollback procedures for pilot go-live. -->
# Database Runbook (Prisma + Postgres)

This runbook is aligned to the current stack: **Prisma** migrations against **Postgres**.

## Golden Rules
- Always backup before running migrations in production.
- Prefer a quiet window for pilot migrations.
- Keep staging and production schemas aligned.

## Migrations

**Check pending migrations**

```bash
pnpm prisma migrate status
```

## Local Development Safety Rails

The repo now wraps destructive Prisma dev commands with safety guards:

- `pnpm prisma:migrate` blocks `prisma migrate dev` unless `DATABASE_URL` points at a sandbox-style DB name (default regex: `sandbox|scratch|seed|e2e|test|tmp`).
- `pnpm db:seed` blocks seeding on protected/non-sandbox DBs by default.

Recommended local split:

1. Keep your manual data in a primary DB (for example `eduhub_dev`).
2. Use a disposable DB (for example `eduhub_scratch`) when running `pnpm prisma:migrate`.
3. Apply generated migrations to your primary DB with `pnpm prisma migrate deploy`.

Explicit one-time overrides (use only when intentional):

```powershell
$env:PRISMA_MIGRATE_DEV_ALLOW_ANY_DB="1"
pnpm prisma:migrate -- --name your_migration_name
```

```powershell
$env:PRISMA_SEED_ALLOW_ANY_DB="1"
pnpm db:seed
```

```powershell
pnpm prisma migrate status
```

**Staging migration**

```bash
pnpm prisma migrate deploy
```

```powershell
pnpm prisma migrate deploy
```

**Production migration procedure**
1. Scale down to a single app instance or enable maintenance mode (if available).
2. Backup the database.
3. Run migrations: `pnpm prisma migrate deploy`.
4. Verify health: `GET /api/health` should return `status: ok`.
5. Scale back to normal traffic.

## Backup Strategy

**Recommendation**
- At minimum, run backups before every production deploy.
- Target retention: **7 daily**, **4 weekly**, **6 monthly** snapshots.

**Command (compressed dump)**

```bash
pg_dump --format=custom --file=backup_$(date +%F).dump "$DATABASE_URL"
```

```powershell
pg_dump --format=custom --file=backup_$(Get-Date -Format "yyyy-MM-dd").dump "$env:DATABASE_URL"
```

**TODO (infra-specific)**
- Where backups are stored (S3, NAS, etc.).
- Who owns and monitors the backup schedule.

## Restore Procedure

**Preferred (restore into a new database)**
1. Create a new Postgres database.
2. Restore:

```bash
pg_restore --clean --no-owner --dbname "$DATABASE_URL" backup_YYYY-MM-DD.dump
```

```powershell
pg_restore --clean --no-owner --dbname "$env:DATABASE_URL" backup_YYYY-MM-DD.dump
```

3. Point the app to the restored database.
4. Verify health with `/api/health` and a basic read query.

**In-place restore (risky)**
- Only use if a full service outage is acceptable.
- Stop the app, restore, then restart.

## Rollback Plan (App + DB)

**App rollback**
- Deploy the previous container image or build artifact.

**DB rollback**
- Prisma does not guarantee safe down migrations for complex changes.
- Primary rollback method: **restore from last known-good backup**.

**Decision Tree**
- If migration fails or data looks wrong: restore backup + rollback app.
- If app-only regression (no schema changes): rollback app only.
