# Step 20.9 - QA Report (Template)

> How to fill this report: Duplicate this file for each manual run, fill every field, and attach screenshots/links where noted. Do not mark items as Pass unless you verified them in the environment listed below.

## Environment
- Deploy URL:
- Commit SHA:
- Date/Time (local):
- Tester:
- Tenant(s) used:
- Browser/OS:
- Build notes (optional):

## Manual Checklist (1-9)
Reference: `docs/release/step-20.9-ux-release-checklist.md`

1) Parent login + auth hardening (invalid creds, throttle/lockout banners, screen reader alert)
Status: [ ] Pass [ ] Fail
Notes:

2) Portal header + logout discoverability (desktop + mobile)
Status: [ ] Pass [ ] Fail
Notes:

3) Dashboard + Students (empty state + linked students)
Status: [ ] Pass [ ] Fail
Notes:

4) Sessions list + Session detail (sorting, filters, back nav)
Status: [ ] Pass [ ] Fail
Notes:

5) Attendance history (newest-first, empty/error states, session links)
Status: [ ] Pass [ ] Fail
Notes:

6) Requests list + absence workflow (pending/withdraw/resubmit, status labels)
Status: [ ] Pass [ ] Fail
Notes:

7) Timezone + language toggle (hint matches help text, locale switch stability)
Status: [ ] Pass [ ] Fail
Notes:

8) Empty/error states + navigation sanity (no blank pages, safe CTAs)
Status: [ ] Pass [ ] Fail
Notes:

9) Admin Audit Log (admin-only, newest-first, filters, mobile detail drawer)
Status: [ ] Pass [ ] Fail
Notes:

## Screenshot Index
| ID | Description | Language | File/Link |
| --- | --- | --- | --- |
| S-01 | Parent login error banner | EN | |
| S-02 | Portal header identity + logout | EN | |
| S-03 | Requests list status labels | EN | |
| S-04 | Admin audit log (filters + detail) | EN | |
| S-05 | zh-CN portal smoke (any key page) | zh-CN | |

## Known Issues / Bug List
| ID | Priority (P0/P1/P2) | Title | Steps to Reproduce | Expected | Actual | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | P1 | Resubmitted absence request keeps old message | Run `pnpm e2e:full` and observe `tests/e2e/portal/resubmit-flow.spec.ts` (withdraw request, resubmit with updated message). | Updated message shown for the resubmitted request. | Message remains "Original request message." |  | Open |
| BUG-002 | P1 | Admin catalog nav link missing | Run `pnpm e2e:full` and observe `tests/e2e/admin/catalog.navigation.spec.ts` (click `nav-link-catalog`). | Admin nav renders and catalog link is clickable. | `nav-link-catalog` not found; test times out. |  | Open |
| BUG-003 | P1 | Admin dashboard not loading from login state | Run `pnpm e2e:full` and observe `tests/e2e/admin/dashboard.navigation.spec.ts` (wait for `/admin` dashboard URL). | Dashboard loads and `admin-dashboard-page` is visible. | `waitForURL` times out waiting for dashboard. |  | Open |
| BUG-004 | P1 | Admin nav missing on reports page | Run `pnpm e2e:full` and observe `tests/e2e/admin/reports.smoke.spec.ts` (expect `admin-nav`). | `admin-nav` is visible and reports link works. | `admin-nav` not found; test fails. |  | Open |
| BUG-005 | P2 | ECONNRESET while loading admin session during portal i18n smoke | Run `pnpm e2e:full` and observe `tests/e2e/portal/absence-request-i18n-smoke.spec.ts` (admin login). | Admin login proceeds without network errors. | `/api/me` request fails with `ECONNRESET`. |  | Open |
| BUG-006 | P2 | ECONNRESET during parent-auth UI setup | Run `pnpm e2e:full` and observe `tests/e2e/portal/parent-auth.ui.spec.ts` (student create). | Parent-auth setup API calls succeed. | `/api/students` request fails with `ECONNRESET`. |  | Open |
| BUG-007 | P1 | Release gate report widgets show no upcoming rows | Run `pnpm e2e:full` and observe `tests/e2e/admin/release.gate.spec.ts` (wait for `reports-upcoming-*` rows after setting filters). | Upcoming report rows render after filters apply. | No upcoming rows found; test times out. |  | Open |
| BUG-008 | P2 | ECONNRESET during admin session check in sessions UI | Run `pnpm e2e:full` and observe `tests/e2e/admin/sessions.spec.ts` (login via `loginViaUI`). | `/api/me` responds reliably. | `/api/me` request fails with `ECONNRESET`. |  | Open |

## Playwright Run Output
- Command(s) used: `pnpm e2e:full`
- Total / Passed / Failed / Skipped: 99 / 93 / 2 / 4
- HTML report path:
- Flaky notes (if any):

## Golden Tests Included
- `tests/e2e/golden/portal-smoke.golden.spec.ts`: Parent portal navigation smoke.
- `tests/e2e/golden/absence-lifecycle.golden.spec.ts`: Absence lifecycle + admin resolve + auto-assist checks.
- `tests/e2e/golden/parent-auth-hardening.golden.spec.ts`: Auth throttle/lockout coverage.
- `tests/e2e/golden/rbac.golden.spec.ts`: Parent blocked from admin audit UI/API.

## Golden Test Commands
- Run golden suite: `pnpm e2e:golden`
- HTML report (optional): `pnpm e2e:golden -- --reporter=html`
- Report location: `playwright-report/`

