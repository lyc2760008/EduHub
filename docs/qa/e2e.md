<!-- E2E runbook for local Playwright usage. -->
# E2E (Playwright) Local Run

## Prerequisites
- A tenant exists (default slug: `demo`), and the admin user is a member of that tenant.
- At least one center exists in the tenant (Users CRUD test will create one if needed).
- Catalog tests create Subjects/Levels/Programs and require the admin role to access `/admin/*`.
- Groups tests require at least one program, one active center, one tutor linked to a center (StaffCenter), and one student in the tenant.
- The app is running locally (for example: `pnpm dev`).

## Required environment variables
Set these in your shell or `.env` before running Playwright:
- `E2E_BASE_URL` (examples below)
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_TENANT_SLUG` (optional, default: `demo`)
- `E2E_TUTOR_EMAIL` (optional, required for tutor-blocked tests)
- `E2E_TUTOR_PASSWORD` (optional, required for tutor-blocked tests)
<!-- Groups tests reuse the admin credentials and optionally the tutor credentials. -->

### Base URL examples
- Subdomain mode: `http://demo.lvh.me:3000`
- Path fallback mode: `http://lvh.me:3000/t/demo`

## Run E2E
```bash
pnpm playwright test
```

## Notes
- Users tests avoid hardcoded UI text and rely on `data-testid` hooks.
- Catalog tests also rely on `data-testid` hooks for create/edit flows and subject selection.
- Groups tests rely on `data-testid` hooks for list/detail actions, tutor assignments, and roster updates.
- If you use a non-default tenant slug, set `E2E_TENANT_SLUG` to match.
- When using `/t/<slug>` in `E2E_BASE_URL`, tests build URLs with the same prefix for API calls.
