# Step 24.1 Staging Validation (Navigation + Reports + Table Toolkit)

**STAGING base URL:** `<fill>`
**Commit SHA:** `<fill>`
**Date/Time (local):** `<fill>`
**Operator:** `<fill>`
**Tenant(s) tested:** `e2e-testing` (automated)

---

## Manual Checklist (Results)

### A) Navigation / IA (new)

| # | Check | Pass/Fail | Notes | Evidence |
|---|-------|-----------|-------|----------|
| 1 | Sidebar groups render and collapse/expand as designed | | | |
| 2 | Active state correct for Students / Parents / Staff | | | |
| 3 | Active state correct for Groups/Classes, Programs, Subjects, Levels | | | |
| 4 | Active state correct for Sessions, Requests, Audit Log | | | |
| 5 | Active state correct for Reports Home + nested report pages | | | |
| 6 | Mobile 320px: hamburger opens drawer, closes properly, no overflow | | | |
| 7 | Keyboard accessibility: tab order sane, focus visible on nav + controls | | | |

### B) RBAC + tenant isolation (P0)

| # | Check | Pass/Fail | Notes | Evidence |
|---|-------|-----------|-------|----------|
| 1 | Non-admin roles cannot see admin-only nav items | | | |
| 2 | Non-admin roles cannot access admin routes by URL | | | |
| 3 | No cross-tenant data exposure in lists/reports/exports | | | |

### C) Reports + Table Toolkit

| # | Check | Pass/Fail | Notes | Evidence |
|---|-------|-----------|-------|----------|
| 1 | Search/filter/sort/pagination work and persist via URL | | | |
| 2 | CSV export matches current filtered view and respects row limits | | | |

---

## E2E Results (Latest Run)

**Commands used:**

```bash
pnpm e2e:full
```

**Summary:**
- Total: 116
- Passed: 82
- Failed: 30
- Skipped: 4

**Playwright HTML report:** `playwright-report/index.html`

---

## Defects Log

| Severity | Title | Repro Steps | Expected | Actual | Evidence | Owner | Status |
|----------|-------|-------------|----------|--------|----------|-------|--------|
| P1 | Go-live admin audit filters timeout | Run `pnpm e2e:full`; failing spec `tests/e2e/go-live/admin-audit.go-live.spec.ts` | Audit filters selectable | Timeout waiting for `audit-range-filter` | `test-results/admin-audit.go-live*` | Dev | Open |
| P0 | Parent onboarding invite flow fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/onboarding/parent-onboarding.spec.ts` (invite flow) | Admin can copy invite message and audit event recorded | Timeout in invite flow | `test-results/parent-onboarding*` | Dev | Open |
| P0 | Parent auth does not land on portal | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/parent-auth.spec.ts` | Parent lands on `/portal` and session persists | Login flow fails/timeout | `test-results/parent-auth*` | Dev | Open |
| P0 | Parent auth UI reset flow fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/parent-auth.ui.spec.ts` (reset flow) | Admin reset code via UI then parent login succeeds | Reset/login flow fails | `test-results/parent-auth-ui*` | Dev | Open |
| P0 | Parent portal access control fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-access-control.spec.ts` | Unlinked student + admin routes blocked | Access control assertion fails | `test-results/portal-access-control*` | Dev | Open |
| P1 | Parent portal empty states fail | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-empty-states.spec.ts` | Empty states visible for no-linked-students | Empty states missing/mismatch | `test-results/portal-empty-states*` | Dev | Open |
| P1 | Parent portal friendly errors fail | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-friendly-errors.spec.ts` | Not-available template renders | Error template not shown | `test-results/portal-friendly-errors*` | Dev | Open |
| P2 | Parent portal i18n (account/help) fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-i18n-account-help-smoke.spec.ts` | EN/zh-CN render without raw keys | Raw key/locale mismatch | `test-results/portal-i18n-account-help*` | Dev | Open |
| P2 | Parent portal i18n (dashboard) fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-i18n-smoke.spec.ts` | EN/zh-CN render without raw keys | Raw key/locale mismatch | `test-results/portal-i18n-smoke*` | Dev | Open |
| P1 | Parent linked visibility fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-linked-visibility.spec.ts` | Only linked students/sessions visible | Visibility assertion fails | `test-results/portal-linked-visibility*` | Dev | Open |
| P1 | Parent logout blocks access fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-logout-blocks-access.spec.ts` | Logout blocks portal pages | Access still possible | `test-results/portal-logout-blocks-access*` | Dev | Open |
| P1 | Parent sorting/time smoke fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-sorting-time-smoke.spec.ts` | Sorting/time expectations met | Sort/time assertions fail | `test-results/portal-sorting-time-smoke*` | Dev | Open |
| P0 | Parent portal tenant isolation fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-tenant-isolation.spec.ts` | Cross-tenant navigation redirects to login | Cross-tenant guard fails | `test-results/portal-tenant-isolation*` | Dev | Open |
| P1 | Parent trust header/pages fail | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/portal-trust-header-and-pages.spec.ts` | Account/help pages render | Page render/assertion fails | `test-results/portal-trust-header*` | Dev | Open |
| P0 | Parent RBAC audit access fails | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/rbac-parent-cannot-access-audit.spec.ts` | Parent blocked from admin audit UI/API | RBAC assertion fails | `test-results/rbac-parent-cannot-access-audit*` | Dev | Open |
| P1 | Parent withdraw restrictions fail | Run `pnpm e2e:full`; failing spec `tests/e2e/portal/withdraw-restrictions.spec.ts` | Approved/declined cannot withdraw | Restriction assertion fails | `test-results/withdraw-restrictions*` | Dev | Open |
| P0 | Admin resolves absence request fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/absence-request-admin-resolve.spec.ts` | Admin can resolve pending request | Resolve flow fails | `test-results/absence-request-admin-resolve*` | Dev | Open |
| P0 | Admin attendance flow fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/attendance.admin.spec.ts` (marking + tamper block) | Attendance persists + tamper blocked | Attendance assertions fail | `test-results/attendance.admin*` | Dev | Open |
| P1 | Audit log absence resolve missing | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/audit-log-shows-absence-resolve.spec.ts` | Audit log entry recorded | Entry missing/timeout | `test-results/audit-log-shows-absence-resolve*` | Dev | Open |
| P1 | Audit log access code reset missing | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/audit-log-shows-access-code-reset.spec.ts` | Audit log entry recorded | Entry missing/timeout | `test-results/audit-log-shows-access-code-reset*` | Dev | Open |
| P1 | Catalog CRUD fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/catalog.crud.spec.ts` | Create program/subject/level succeeds | CRUD flow fails/timeout | `test-results/catalog.crud*` | Dev | Open |
| P1 | Admin notes persistence fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/notes.admin.spec.ts` | Notes persist after reload | Notes assertion fails | `test-results/notes.admin*` | Dev | Open |
| P0 | Admin regression loop fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/regression-admin-loop.spec.ts` | End-to-end loop completes | Loop fails mid-flow | `test-results/regression-admin-loop*` | Dev | Open |
| P0 | Release gate admin critical path fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/release.gate.spec.ts` (admin critical path) | Critical path passes | One or more steps fail | `test-results/release.gate*` | Dev | Open |
| P0 | Release gate tutor RBAC fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/release.gate.spec.ts` (tutor RBAC) | Tutor restrictions enforced | RBAC assertions fail | `test-results/release.gate*` | Dev | Open |
| P1 | Sessions generator fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/sessions.generator.spec.ts` | Dry run + commit succeed | Generator flow fails | `test-results/sessions.generator*` | Dev | Open |
| P1 | Sessions one-off create fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/sessions.spec.ts` (one-off) | One-off session created | Creation flow fails | `test-results/sessions--slow*` | Dev | Open |
| P1 | Sessions recurring confirm fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/sessions.spec.ts` (recurring) | Recurring preview/confirm succeeds | Confirmation fails | `test-results/sessions--slow*` | Dev | Open |
| P1 | Student create + parent link fails | Run `pnpm e2e:full`; failing spec `tests/e2e/admin/students.parent-link.spec.ts` | Student created + parent linked | Create/link flow fails | `test-results/students.parent-link*` | Dev | Open |
