# Testing Guide

<!-- Added for Playwright E2E quickstart and required env vars. -->

## E2E (Playwright)
- Run all E2E tests: `pnpm test:e2e`
- Headed mode: `pnpm test:e2e --headed`

### Required environment variables
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_TUTOR_EMAIL`
- `E2E_TUTOR_PASSWORD`

### Optional environment variables
- `E2E_TENANT_SLUG` (defaults to `demo`)
- `E2E_BASE_URL` (defaults to `http://demo.lvh.me:3000`)
