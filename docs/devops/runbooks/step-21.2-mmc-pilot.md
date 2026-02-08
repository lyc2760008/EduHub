<!-- Purpose: runbook for MMC pilot setup (DevOps-only, no secrets). -->
# Runbook: Step 21.2 MMC Pilot Setup

## Scope
- DevOps-only setup of MMC Education Calgary tenant, staff, groups, and sessions.
- Uses `scripts/pilot/mmc-setup.ts` with schedule data in `scripts/pilot/mmc-spring-2026.schedule.ts`.

## Prereqs
- Set `DATABASE_URL` in your shell or local env file (do not commit secrets).
- Update the schedule file with PO-approved classes before production.
- Staging must be run and QA must be green before production.

## Staging (Dry Run Then Apply)
```powershell
$env:DATABASE_URL = "<NEON_STAGING_DATABASE_URL>"

# Dry run (no writes)
pnpm pilot:mmc:staging -- --dry-run

# Apply (optional test parents)
pnpm pilot:mmc:staging -- --include-test-parents
```

## Staging Replacement Mode (When Existing Term Sessions Must Be Replaced)
```powershell
$env:DATABASE_URL = "<NEON_STAGING_DATABASE_URL>"

# Dry run replacement (reports how many GROUP/CLASS sessions in term range would be deleted)
pnpm pilot:mmc:staging -- --dry-run --replace-existing-in-range

# Apply replacement (deletes all tenant GROUP/CLASS sessions in term range across all centers, then recreates from schedule)
pnpm pilot:mmc:staging -- --replace-existing-in-range --include-test-parents
```

## QA Handoff
- Share the staging deploy log entry from `docs/devops/deploy-logs/step-21.2-mmc-staging.md`.
- Provide tenant slug + tenantId, staff userIds, groupIds, and session counts per group.
- Confirm term range `2026-02-09` to `2026-06-13` in `America/Edmonton`.

## Production (Only After QA Green)
```powershell
$env:DATABASE_URL = "<NEON_PRODUCTION_DATABASE_URL>"

# Dry run (requires confirmation)
pnpm pilot:mmc:prod -- --dry-run --confirm-prod

# Apply (requires confirmation)
pnpm pilot:mmc:prod -- --confirm-prod
```

## Optional Overrides
- `--tenantSlug <slug>` to override the default `mmc` tenant slug.
- `--schedule <path>` to point at a different schedule file.

## Safety Guards
- `--confirm-prod` is mandatory in production (even for dry runs).
- `--include-test-parents` is rejected in production.
- `--replace-existing-in-range` is staging-only and rejected in production.
- The script has no destructive options and refuses reset-style flags.

## Rollback Boundaries
- The script is idempotent by default and only uses upserts unless `--replace-existing-in-range` is passed in staging.
- Rollback requires manual cleanup in the database if incorrect data is created.
- See `docs/ops/db-runbook.md` for manual cleanup guidance.
