<!-- Step 23.2 QA artifact template for homework workflow coverage. Fill this during execution/triage. -->
# Step 23.2 QA - Homework Workflow (Parent/Tutor/Admin)

## Metadata
- Step: `23.2`
- Feature pack: `Homework Review Queue + Parent Homework Inbox`
- Date: `2026-02-13`
- QA owner: `Codex (QA automation pass)`
- Environment: `Local E2E tenant (e2e-testing.lvh.me)`
- Branch: `staging`
- Commit SHA: `1749f80` (baseline before this QA patch set)
- Auth strategy: `Option A (deterministic login + Playwright storageState)`

## Feature Validation

### 1) Parent Inbox + Uploads
- [x] Parent sees linked-child homework only.
- [x] Parent downloads assignment when present.
- [x] Parent uploads valid submission (PDF/DOCX <= 5MB) and status becomes `SUBMITTED`.
- [x] Parent invalid type blocked with clear error.
- [x] Parent oversize file blocked with clear error.
- Notes:
  - Covered by `tests/e2e/portal/homework-inbox-upload.spec.ts`.

### 2) Tutor/Admin Review Queue + Feedback
- [x] Tutor queue shows tutor-owned items only.
- [x] Admin queue shows all tenant items.
- [x] Tutor/Admin download submission.
- [x] Tutor/Admin upload feedback.
- [x] `SUBMITTED -> REVIEWED` transition works and persists.
- Notes:
  - Covered by `tests/e2e/tutor/homework-review-queue.spec.ts` and `tests/e2e/admin/homework-admin-queue-bulk.spec.ts`.

### 3) Versioning
- [x] Replacing upload creates next version.
- [x] Latest version shown by default.
- [x] Parent sees latest only (no historical version list in v1).
- [x] Staff version history lists multiple versions.
- Notes:
  - Parent v1/v2 submission replacement and staff assignment/feedback replacement validated.

### 4) Bulk Mark Reviewed
- [x] Multi-select works.
- [x] Confirm modal count is correct.
- [x] Eligible items changed to `REVIEWED`.
- [x] Ineligible items unchanged.
- [x] Result summary count is correct.
- Notes:
  - Mixed eligibility path validated (reviewed + assigned rows skipped, submitted row updated).

### 5) SLA Report + CSV Export
- [x] Metrics match deterministic ground truth.
- [x] URL state persists for filters.
- [x] CSV respects filters.
- [x] CSV parses successfully.
- [x] CSV contains no file URLs.
- [x] Empty dataset handled gracefully.
- Notes:
  - Covered by `tests/e2e/admin/homework-sla-report-export.spec.ts`.

## Security / RBAC / Tenant Checklist
- [x] Cross-tenant list/detail/upload/download blocked.
- [x] Parent cannot access unlinked student homework by id.
- [x] Tutor cannot access other tutor homework by id.
- [x] Downloads require auth (no public links).
- [x] Response payload and CSV scans show no sensitive strings.
- Manual/ops log-sink review:
  - External sink review remains manual (out of Playwright scope).

## E2E Iteration Log (`pnpm e2e:full`)
| Iteration | Command | Result | Failures | Fix summary |
| --- | --- | --- | --- | --- |
| 1 | `pnpm e2e:full` | Failed | 4 failed / 1 flaky | Patched Step 23.2 specs (regex/selector issues), fixed tutor API route usage in homework E2E. |
| 2 | `pnpm e2e:full` | Failed | 1 failed / 2 flaky | Hardened progress-notes selectors (strict-mode collision), stabilized tutor zoom detail probe. |
| 3 | `pnpm e2e:full` | Passed | 0 failed | Full suite green after E2E selector/probe hardening. |

## Issues Found + Resolutions
- Issue: malformed regex fallback patterns in new Step 23.2 specs (`TS1507`).
  - Impact: Typecheck failed; E2E specs would not compile.
  - Resolution: Replaced malformed multilingual regex alternates with stable selectors/test IDs.
  - Verification: `pnpm typecheck` passed.
- Issue: tutor request probes used ambiguous/non-exact API matching.
  - Impact: False negatives in tutor homework and zoom-link E2E.
  - Resolution: Used tenant-prefixed tutor API routes and exact direct request assertions.
  - Verification: Tutor homework and tutor zoom-link suites passed in targeted + full runs.
- Issue: progress-notes strict-mode collision (`getByText("Progress Notes")` matched heading + aria-live text).
  - Impact: Intermittent full-suite failure.
  - Resolution: Switched to heading-role selector and added render-count wait for deterministic list assertions.
  - Verification: Progress-notes suite and full regression loop passed.

## QA Decision
- Decision: `PASS`
- Scope validated:
  - Parent inbox/download/upload validations
  - Tutor/admin queue + feedback + status transitions
  - Versioning behavior
  - Bulk reviewed workflow
  - SLA metrics + CSV export
  - RBAC/tenant/download/sensitive-content checks
- Residual risk:
  - Existing non-homework E2E flake profile is reduced but still environment-sensitive for some legacy suites.
- Follow-up owner:
  - QA + platform test owners
- Follow-up due date:
  - Next regression cycle

## Artifacts
- CI run link:
  - Local run (no CI URL in this execution context).
- Playwright HTML report path:
  - `playwright-report/index.html`
- Additional logs/evidence:
  - `test-results/` folders from iterative runs.
