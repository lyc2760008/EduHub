<!--
  QA Artifact Template: Step 22.8 Announcements + Read Receipts + Engagement Report/CSV

  Purpose:
  - Capture deterministic E2E coverage outcomes for Step 22.8.
  - Track stop-on-first-failure iteration history and root-cause categories.
  - Preserve a shareable artifact without exposing secrets/tokens/cookies/raw sensitive payloads.
-->
# Step 22.8 QA Report (Announcements + Read Receipts + Engagement/CSV)

## Metadata
- Environment: `<staging/local>`
- Base URL: `<E2E_BASE_URL>`
- Commit SHA: `<git-sha>`
- Date/Time (America/Edmonton): `<YYYY-MM-DD HH:mm:ss>`
- QA operator: `Codex`
- Tenant slug tested (primary): `<tenant-slug>`
- Secondary tenant slug: `<secondary-tenant-slug>`
- Auth strategy used: `Option A (deterministic login + Playwright storageState)`
- Scope version: `Step 22.8`

## Validation Checklist - Admin (Announcements)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Admin can create draft announcement | Pending |  | `tests/e2e/admin/announcements.spec.ts` |
| Admin can edit draft announcement | Pending |  | `tests/e2e/admin/announcements.spec.ts` |
| Admin can publish announcement | Pending |  | `tests/e2e/admin/announcements.spec.ts` |
| Admin can archive announcement | Pending |  | `tests/e2e/admin/announcements.spec.ts` |
| List toolkit supports search/filter/sort/pagination | Pending |  | `tests/e2e/admin/announcements.spec.ts` |
| URL query state persists after reload | Pending |  | `tests/e2e/admin/announcements.spec.ts` |

## Validation Checklist - Parent/Tutor (Feed + Detail + Read Receipts)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Parent sees published announcements only | Pending |  | `tests/e2e/portal/announcements-parent.spec.ts` |
| Parent detail opens and preserves body line breaks | Pending |  | `tests/e2e/portal/announcements-parent.spec.ts` |
| Parent unread indicator clears after opening detail | Pending |  | `tests/e2e/portal/announcements-parent.spec.ts` |
| Parent read endpoint is idempotent | Pending |  | `tests/e2e/portal/announcements-parent.spec.ts` |
| Tutor sees published announcements only | Pending |  | `tests/e2e/tutor/announcements-tutor.spec.ts` |
| Tutor detail opens and preserves body line breaks | Pending |  | `tests/e2e/tutor/announcements-tutor.spec.ts` |
| Tutor unread indicator clears after opening detail | Pending |  | `tests/e2e/tutor/announcements-tutor.spec.ts` |
| Tutor read endpoint is idempotent | Pending |  | `tests/e2e/tutor/announcements-tutor.spec.ts` |

## Validation Checklist - Engagement Report + CSV
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Engagement report returns per-announcement aggregates | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| Read counts align with deterministic read actions | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| CSV export respects active filters/search/sort | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| CSV parses with a proper parser (XLSX) | Pending |  | `tests/e2e/helpers/announcements.ts` |
| Empty dataset export is graceful and parseable | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |

## Validation Checklist - Security / RBAC / Tenant
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Non-admin blocked from admin announcements UI/API | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| Cross-tenant access blocked for announcements/report APIs | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| Tenant-wide v1 behavior validated (center-scoped not active) | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| Parent/Tutor feed API omits body field | Pending |  | `tests/e2e/admin/announcements-engagement-report.spec.ts` |
| Report/CSV payloads omit sensitive patterns and sentinel body content | Pending |  | `tests/e2e/helpers/announcements.ts` |

## E2E Iteration Log (`pnpm e2e:full -- --max-failures=1 --workers=1`)
<!--
  Fill one row per stop-on-first iteration.
  Required fields:
  - first failing spec/test
  - root-cause category
  - minimal fix applied
-->
| Iteration | Timestamp | Command | Result | First Failing Spec/Test | Root-Cause Category | Fix Applied |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `<ts>` | `pnpm e2e:full -- --max-failures=1 --workers=1` | `<pass/fail>` | `<spec::test>` | `<category>` | `<summary>` |

## Issues Found + Resolutions
| Severity | Issue | Detection | Resolution | Evidence |
| --- | --- | --- | --- | --- |
| `<high/medium/low>` | `<issue>` | `<where detected>` | `<what changed>` | `<file/test>` |

## QA Decision
- Decision: `<GO / NO-GO / CONDITIONAL>`
- Rationale: `<brief rationale>`
- Follow-ups: `<manual checks or non-blocking items>`

## Artifact / Log Links
- CI job link: `<link>`
- Playwright HTML report: `playwright-report/index.html`
- Attached logs/evidence: `<path or link>`
