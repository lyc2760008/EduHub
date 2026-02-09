<!-- E2E runbook for local Playwright usage. -->
# E2E (Playwright) Local Run

## Prerequisites
- A tenant exists (default slug: `demo`), and the admin user is a member of that tenant.
- At least one center exists in the tenant (Users CRUD test will create one if needed).
- Catalog tests create Subjects/Levels/Programs and require the admin role to access `/admin/*`.
- Groups tests require at least one program, one active center, one tutor linked to a center (StaffCenter), and one student in the tenant.
- Session notes tests require a session assigned to Tutor1 and a different Tutor2 user in the same tenant.
- Reports tests require a tutor assigned to a center so a future session can be created for filter assertions.
- The app is running locally (for example: `pnpm dev`).

## Required environment variables
Set these in your shell or `.env` before running Playwright:
- `E2E_BASE_URL` (examples below)
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_TENANT_SLUG` (optional, default: `demo`)
- `E2E_TUTOR_EMAIL` (optional, required for existing tutor-blocked tests)
- `E2E_TUTOR_PASSWORD` (optional, required for existing tutor-blocked tests)
- `E2E_TUTOR1_EMAIL` (required for attendance + reports filter tests)
- `E2E_TUTOR1_PASSWORD` (required for attendance + reports filter tests)
- `E2E_TUTOR2_EMAIL` (required for attendance tests)
- `E2E_TUTOR2_PASSWORD` (required for attendance tests)
- `E2E_PARENT_ACCESS_EMAIL` (optional, parent portal access-code login for go-live)
- `E2E_PARENT_ACCESS_CODE` (optional, parent portal access code for go-live)
<!-- Students parent-link E2E uses a unique email per run and does not require a pre-seeded parent. -->
<!-- Attendance + notes RBAC tests use Tutor1/Tutor2; other security tests still use the legacy tutor vars. -->
<!-- Reports tests create a future session for Tutor1 when needed to make filters deterministic. -->
<!-- E2E_PARENT_ACCESS_* stays separate from E2E_PARENT_EMAIL to avoid colliding with staff parent-role logins. -->

## Staging Credential Setup (Standard Process)
<!-- Standardized staging credential setup uses the seed script to avoid role-guarded reset limitations. -->
Use the staging seed script to create or reset the Owner/Admin, Tutor, and Parent users in the staging tenant.

1. Set the staging DB URL and a strong seed password (do not commit secrets).
2. Provide the exact tenant slug and user emails you want for staging E2E.
3. Run the staging seed script and use those credentials for E2E or manual login.

```powershell
$env:DATABASE_URL="<STAGING_DATABASE_URL>"
$env:SEED_DEFAULT_PASSWORD="<STRONG_PASSWORD>"
$env:SEED_DEMO_TENANT_SLUG="<staging-tenant-slug>"
$env:SEED_OWNER_EMAIL="staging-owner@example.com"
$env:SEED_TUTOR_EMAIL="staging-tutor@example.com"
$env:SEED_PARENT_EMAIL="staging-parent@example.com"
powershell -File scripts/seed-neon-staging.ps1
```

Notes:
- Users are global across tenants; changing a password affects that email everywhere.
- Use dedicated staging-only emails to avoid impacting real accounts.
- Staff login URL format: `https://<staging-host>/<tenant-slug>/login`.
- Parent login uses access codes and a separate page: `https://<staging-host>/<tenant-slug>/parent/login`.

### Base URL examples
- Subdomain mode: `http://demo.lvh.me:3000`
- Path fallback mode: `http://lvh.me:3000/t/demo`

## Run E2E
```bash
pnpm playwright test
```
<!-- Release gate spec runs the MVP critical path checks only. -->
```bash
pnpm playwright test tests/e2e/release.gate.spec.ts
```
<!-- Dashboard navigation spec keeps admin widget links and nav highlight regression-safe. -->
```bash
pnpm playwright test tests/e2e/dashboard.navigation.spec.ts
```
<!-- Students CRUD + parent-link spec and RBAC guard. -->
```bash
pnpm playwright test tests/e2e/students.parent-link.spec.ts
pnpm playwright test tests/e2e/students.rbac.tutor.spec.ts
pnpm playwright test tests/e2e/students.regression-deps.spec.ts
```

## Notes
- Users tests avoid hardcoded UI text and rely on `data-testid` hooks.
- Catalog tests also rely on `data-testid` hooks for create/edit flows and subject selection.
- Groups tests rely on `data-testid` hooks for list/detail actions, tutor assignments, and roster updates.
- If you use a non-default tenant slug, set `E2E_TENANT_SLUG` to match.
- When using `/t/<slug>` in `E2E_BASE_URL`, tests build URLs with the same prefix for API calls.
- Attendance tests require at least one upcoming session assigned to Tutor1 with a roster of 2+ students and a different Tutor2 user in the tenant.
- Notes tests reuse the same Tutor1/Tutor2 setup and persist session notes through the detail page.
- Reports filter tests reuse Tutor1 to create a future session and assert upcoming date-range changes.
<!-- Students regression spec expects at least one group and one student for the roster and one-off session flows. -->
