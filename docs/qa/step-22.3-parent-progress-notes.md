<!--
  QA Template: Step 22.3 Parent Progress Notes (v1)

  Purpose:
  - Capture STAGING manual checks and automated regression outcomes in one artifact.
  - Keep the report safe to share: never paste secrets, cookies, tokens, or full PII payloads.
-->
# Step 22.3 QA Report (Parent Progress Notes v1) - STAGING

## Metadata
- STAGING base URL: `<fill>`
- Commit SHA: `<fill>`
- Date/Time (America/Edmonton): `<fill>`
- QA operator: `<fill>`
- Tenant slug tested: `<fill>`
- Scope version: `Step 22.3`

## Scope Summary
- Feature under test: Parent Student Detail Progress Notes section at `/[tenant]/portal/students/[id]`.
- Coverage focus: parent-visible note timeline, pagination, i18n sanity, RBAC + tenant isolation, no internal-note leakage.
- Non-goals: Admin/tutor authoring workflows, dashboard redesign, non-portal modules.

## Manual Validation Checklist (STAGING placeholders)

### Feature behavior
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Linked parent can open Student Detail and see Progress Notes section |  |  |  |
| Notes are newest-first |  |  |  |
| Load more appends next page and keeps existing items visible |  |  |  |
| Empty state appears for linked student with no notes |  |  |  |
| Error state copy is user-friendly (no technical internals) |  |  |  |

### Privacy and security (P0)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Unlinked student probe is blocked (safe 403/404/not-available state) |  |  |  |
| Cross-tenant student probe is blocked (safe 403/404/not-available state) |  |  |  |
| Internal/staff-only note content never appears in portal UI |  |  |  |
| Internal/staff-only note content never appears in portal API payloads |  |  |  |

### i18n sanity
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| EN copy renders correctly in Progress Notes section |  |  |  |
| zh-CN copy renders correctly in Progress Notes section |  |  |  |
| No raw i18n keys visible in rendered page |  |  |  |

## E2E Iteration Log
<!--
  Record each regression loop iteration (stop-on-first-failure mode) and the root-cause/fix pair.
  Suggested command:
  - pnpm e2e:full -- --max-failures=1 --workers=1
-->
| Iteration | Timestamp | Command | Result | First Failure | Root Cause Category | Fix Applied |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `<fill>` | `pnpm e2e:full -- --max-failures=1 --workers=1` | `<pass/fail>` | `<spec/test>` | `<selector drift / contract drift / auth / seed / etc>` | `<fill>` |
| 2 | `<fill>` | `pnpm e2e:full -- --max-failures=1 --workers=1` | `<pass/fail>` | `<spec/test>` | `<fill>` | `<fill>` |
| N | `<fill>` | `pnpm e2e:full` | `<pass/fail>` | `<if any>` | `<fill>` | `<fill>` |

## Issues Found and Resolutions
| Severity | Issue | Detection | Resolution | Evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## QA Decision
- Decision: `<GO / NO-GO>`
- Rationale: `<fill>`
- Follow-ups (if any): `<fill>`

