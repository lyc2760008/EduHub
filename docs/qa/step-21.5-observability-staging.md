<!-- QA template for Step 21.5C observability validation in STAGING. -->
# Step 21.5 Observability + Support Ops Pack Validation (STAGING)

<!-- Record environment metadata before running any tests. -->
## 1) Environment / Metadata
- STAGING base URL: `<REPLACE_ME>`
- Commit SHA / release: `<REPLACE_ME>`
- Date/time (UTC): `<REPLACE_ME>`
- Operator: `<REPLACE_ME>`

<!-- Telemetry validation results must be recorded here; do not claim results until verified. -->
## 2) Telemetry Validation (Must Pass)

### Section 1: Error Capture
<!-- Use the controlled test error route from Dev docs; record evidence below. -->
Steps to trigger controlled test error:
1. Reference Dev docs: `docs/devops/observability.md`.
2. Trigger the staging-only endpoint (tenant-aware):
   - `GET /t/<tenantSlug>/api/__debug/sentry-test`
3. Confirm the response returns a controlled error JSON payload.

Automation note:
- No Playwright telemetry test added because the trigger is API-only (no UI boundary to assert). Manual validation required.

Evidence checklist:
- [ ] Event appears in telemetry dashboard
- [ ] Tagged `environment=staging`
- [ ] Release/version present
- [ ] Stack trace readable (source maps if enabled)

Fields to record:
- Dashboard link: `<REPLACE_ME>`
- Event ID: `<REPLACE_ME>`
- Screenshot reference: `<REPLACE_ME>`

### Section 2: No Sensitive Data Leakage (P0)
<!-- Inspect a sample of events and verify forbidden data is absent. -->
Sampling procedure:
- Inspect N events (suggest N=20) across error + navigation events.
- Inspect payload fields, query strings, breadcrumbs, and request metadata.

Forbidden data checklist:
- [ ] Access codes
- [ ] Auth tokens (bearer/jwt)
- [ ] Cookies
- [ ] Authorization headers
- [ ] Secrets in query strings
- [ ] Password fields

Record findings table:
| Event ID | Type | Field | Snippet | Severity |
| --- | --- | --- | --- | --- |
| `<REPLACE_ME>` | `<REPLACE_ME>` | `<REPLACE_ME>` | `<REPLACE_ME>` | `<REPLACE_ME>` |

P0 rule:
- If any sensitive data is present, release is **NO-GO** until fixed by Dev.

### Section 3: Performance Sanity (Basic)
<!-- Lightweight navigation check for obvious slowdowns. -->
Checklist:
- [ ] Login -> dashboard
- [ ] Dashboard -> reports
- [ ] Reports -> back

Notes:
- `<REPLACE_ME>`

<!-- Regression results are required after running pnpm e2e:full. -->
## 3) Regression Results
Commands run:
- `E2E_BASE_URL=https://eduhub-staging.vercel.app E2E_TENANT_SLUG=e2e-testing E2E_SKIP_SEED=1 E2E_WORKERS=2 pnpm e2e:full`

Summary:
- Total: `116`
- Passed: `6`
- Failed: `50`
- Skipped: `60` (did not run)

Playwright HTML report:
- `playwright-report/index.html`

Fix loop log:
| Iteration # | Failures Summary | Fix Summary | Rerun Result |
| --- | --- | --- | --- |
| `1` | Login locators not found when base URL used `/t/<slug>` | Adjusted tenant helper to use `/t/<slug>/api` for API while keeping UI at `/<slug>` | Rerun executed |
| `2` | Admin setup/login failed; portal/go-live tests cascade-failed | None (requires staging admin credentials or data) | Failed |

<!-- Issues and final disposition must be captured here. -->
## 4) Issues / Disposition
P0/P1/P2 table:
| Severity | Title | Repro Steps | Expected vs Actual | Evidence Links | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Staging E2E admin login fails for `e2e-testing` tenant | Run `pnpm e2e:full` with staging base URL and default E2E credentials | Expected admin storage state to generate; actual timeout waiting for `login-email` flow | `test-results/admin.setup.ts-Admin-storage-state-setup-admin*` | QA + DevOps | Open |

Final gate decision:
- GO / NO-GO + rationale: `NO-GO pending staging E2E admin credentials; regression suite not green.`
