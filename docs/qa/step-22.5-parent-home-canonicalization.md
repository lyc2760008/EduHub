<!--
  QA Template: Step 22.5 Parent Home Canonicalization (v1)

  Purpose:
  - Capture validation evidence for canonical route behavior: /[tenant]/parent -> /[tenant]/portal.
  - Track full-suite regression loop outcomes (pnpm e2e:full) in one artifact.
  - Keep the report safe to share: never paste secrets, cookies, tokens, or full PII payloads.
-->
# Step 22.5 QA Report (Parent Home Canonicalization) - STAGING

## Metadata
- STAGING base URL: `<fill>`
- Commit SHA: `<fill>`
- Date/Time (America/Edmonton): `<fill>`
- QA operator: `<fill>`
- Tenant slug tested (primary): `<fill>`
- Secondary tenant slug (cross-tenant checks): `<fill>`
- Auth strategy used: `Option A (deterministic Parent login + Playwright storageState)`
- Scope version: `Step 22.5`

## Scope Summary
- Feature under test: canonical parent landing route behavior at `/[tenant]/parent` and `/[tenant]/portal`.
- Coverage focus: server-side silent redirect, no redirect loop, portal page stability, auth guard integrity, tenant isolation, unlinked student access control.
- Non-goals: portal visual redesign, parent auth UX changes, admin/tutor feature changes.

## Validation Checklist (placeholders)

### Redirect canonicalization
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Authenticated desktop: `/${tenant}/parent` returns main-document 3xx redirect to `/${tenant}/portal` |  |  |  |
| Authenticated mobile (390x844): same 3xx redirect behavior |  |  |  |
| Final URL settles at canonical `/${tenant}/portal` |  |  |  |
| No redirect loop observed (single redirect hop, navigation settles normally) |  |  |  |

### Portal page stability
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Representative portal page (for example `/${tenant}/portal/students`) still loads |  |  |  |
| Representative portal page does not regress to error state under normal seeded data |  |  |  |

### Security / RBAC / tenant isolation (P0)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Unauthenticated access to `/${tenant}/parent` remains guarded (no portal content exposure) |  |  |  |
| Unauthenticated access to `/${tenant}/portal` remains guarded (no portal content exposure) |  |  |  |
| Authenticated parent cannot access another tenant portal via route manipulation |  |  |  |
| Authenticated parent cannot access unlinked student page by ID |  |  |  |
| Unlinked-student API probe returns blocked/not-found (`403/404`) |  |  |  |

## E2E Iteration Log
<!--
  Record each full-regression loop iteration until green.
  Required command:
  - pnpm e2e:full
-->
| Iteration | Timestamp | Command | Result | First Failure | Root Cause Category | Fix Applied |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `<fill>` | `pnpm e2e:full` | `<pass/fail>` | `<spec/test>` | `<auth / seed / selector / routing / env / other>` | `<fill>` |
| 2 | `<fill>` | `pnpm e2e:full` | `<pass/fail>` | `<spec/test>` | `<fill>` | `<fill>` |
| N | `<fill>` | `pnpm e2e:full` | `<pass/fail>` | `<if any>` | `<fill>` | `<fill>` |

## Issues Found and Resolutions
| Severity | Issue | Detection | Resolution | Evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## QA Decision
- Decision: `<GO / NO-GO>`
- Rationale: `<fill>`
- Follow-ups (if any): `<fill>`

