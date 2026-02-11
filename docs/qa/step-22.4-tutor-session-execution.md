<!--
  QA Template: Step 22.4 Tutor Session Execution Pack v1

  Purpose:
  - Track STAGING manual checks and automated regression loops in one artifact.
  - Keep the report safe to share: never paste secrets, cookies, tokens, or full PII payloads.
-->
# Step 22.4 QA Report (Tutor My Sessions + Run Session) - STAGING

## Metadata
- STAGING base URL: `<fill>`
- Commit SHA: `<fill>`
- Date/Time (America/Edmonton): `<fill>`
- QA operator: `<fill>`
- Tenant slug tested: `<fill>`
- Scope version: `Step 22.4`

## Scope Summary
- Feature under test: Tutor `My Sessions` and `Run Session` flows at `/[tenant]/tutor/sessions` and `/[tenant]/tutor/sessions/[id]`.
- Coverage focus: tutor-only session visibility, attendance + parent-visible note persistence, RBAC/tenant isolation, i18n sanity, mobile sanity.
- Non-goals: parent/admin UX changes, scheduling edits, internal/staff note editing.

## Manual Validation Checklist (STAGING placeholders)

### Feature behavior
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Tutor can open My Sessions and see expected assigned sessions |  |  |  |
| Tutor can open Run Session from My Sessions |  |  |  |
| Tutor can edit attendance + parent-visible notes and save |  |  |  |
| Refresh preserves saved statuses and parent-visible notes |  |  |  |
| Empty roster and error states are usable and non-technical |  |  |  |

### Privacy and security (P0)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Tutor cannot open another tutor's session by ID |  |  |  |
| Tutor cannot open another tenant's session by ID |  |  |  |
| Tutor DOM never shows internal/staff-only sentinel note |  |  |  |
| Tutor API payloads exclude internal/staff-only fields/content |  |  |  |

### i18n and mobile sanity
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| EN copy renders correctly on My Sessions and Run Session |  |  |  |
| zh-CN copy renders correctly on My Sessions and Run Session |  |  |  |
| No raw i18n keys visible in rendered pages |  |  |  |
| Mobile viewport has no horizontal scroll; primary actions reachable |  |  |  |

## E2E Iteration Log
<!--
  Record each stop-on-first-failure loop iteration.
  Suggested command:
  - pnpm e2e:full -- --max-failures=1 --workers=1
-->
| Iteration | Timestamp | Command | Result | First Failure | Root Cause Category | Fix Applied |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `<fill>` | `pnpm e2e:full -- --max-failures=1 --workers=1` | `<pass/fail>` | `<spec/test>` | `<auth / seed / selector / contract / env>` | `<fill>` |
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
