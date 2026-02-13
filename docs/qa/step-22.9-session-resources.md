<!--
  QA Artifact Template: Step 22.9 Session Resources + Bulk Apply + Missing-Resources Report/CSV

  Purpose:
  - Track deterministic E2E validation for Step 22.9 across Admin/Tutor/Parent/report/audit/security.
  - Capture stop-on-first-failure iteration history while fixing regressions to green.
  - Keep the artifact safe to share by avoiding secrets/tokens/cookies/raw sensitive payloads.
-->
# Step 22.9 QA Report (Session Resources + Bulk Apply + Missing-Resources Report/CSV)

## Metadata
- Environment: `<staging/local>`
- Base URL: `<E2E_BASE_URL>`
- Commit SHA: `<git-sha>`
- Date/Time (America/Edmonton): `<YYYY-MM-DD HH:mm:ss>`
- QA operator: `Codex`
- Tenant slug tested (primary): `<tenant-slug>`
- Secondary tenant slug: `<secondary-tenant-slug>`
- Auth strategy used: `Option A (deterministic login + Playwright storageState)`
- Scope version: `Step 22.9`

## Validation Checklist - Admin Session Resources
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Add resource succeeds on admin session detail page | Pending |  | `tests/e2e/admin/session-resources-admin.spec.ts` |
| Edit resource persists after refresh | Pending |  | `tests/e2e/admin/session-resources-admin.spec.ts` |
| Delete resource removes row and stays removed after refresh | Pending |  | `tests/e2e/admin/session-resources-admin.spec.ts` |
| URL validation blocks non-http/https values | Pending |  | `tests/e2e/admin/session-resources-admin.spec.ts` |
| Resource row shows type + title + open-link anchor | Pending |  | `tests/e2e/admin/session-resources-admin.spec.ts` |

## Validation Checklist - Tutor
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Tutor can view resources for owned session | Pending |  | `tests/e2e/tutor/session-resources-tutor.spec.ts` |
| Tutor permission mode matches PO decision (create-only default) | Pending |  | `tests/e2e/tutor/session-resources-tutor.spec.ts` |
| Tutor cannot access resources for non-assigned session | Pending |  | `tests/e2e/tutor/session-resources-tutor.spec.ts` |

## Validation Checklist - Parent
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Parent can view resources for linked-student sessions | Pending |  | `tests/e2e/portal/session-resources-parent.spec.ts` |
| Parent cannot access resources for unlinked sessions | Pending |  | `tests/e2e/portal/session-resources-parent.spec.ts` |
| Parent sees read-only resources (no edit controls) | Pending |  | `tests/e2e/portal/session-resources-parent.spec.ts` |

## Validation Checklist - Bulk Apply
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Admin bulk action applies resources to selected sessions | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| Duplicate rule enforced (skip same URL+type in same session) | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| Summary counts are correct (processed/updated/created/skipped) | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |

## Validation Checklist - Missing-Resources Report + CSV
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Report filters/search/sort/page are server-side and URL-backed | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| URL state persists after reload | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| CSV export respects active filters/search/sort | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| CSV parses correctly and has expected columns | Pending |  | `tests/e2e/helpers/sessionResources.ts` |
| Empty dataset export is graceful | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |

## Validation Checklist - Audit
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| `sessionResource.created` emitted after create | Pending |  | `tests/e2e/admin/session-resources-audit.spec.ts` |
| `sessionResource.updated` emitted after update | Pending |  | `tests/e2e/admin/session-resources-audit.spec.ts` |
| `sessionResource.deleted` emitted after delete | Pending |  | `tests/e2e/admin/session-resources-audit.spec.ts` |
| `sessionResource.bulkApplied` emitted after bulk apply | Pending |  | `tests/e2e/admin/session-resources-audit.spec.ts` |
| Audit metadata stays safe (no URLs/tokens/cookies/secrets) | Pending |  | `tests/e2e/admin/session-resources-audit.spec.ts` |

## Validation Checklist - Security / RBAC / Tenant
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Cross-tenant access blocked for admin session-resource/report routes | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| Non-admin blocked from admin bulk/report endpoints | Pending |  | `tests/e2e/admin/session-resources-bulk-report.spec.ts` |
| CSV/JSON payloads contain no sensitive leakage patterns | Pending |  | `tests/e2e/helpers/sessionResources.ts` |
| Internal sentinel `INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_LEAK` absent from safe outputs | Pending |  | `tests/e2e/helpers/sessionResources.ts` |

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
