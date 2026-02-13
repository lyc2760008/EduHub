<!--
  QA Artifact Template: Step 22.7 Scheduling Efficiency + ZoomLink

  Purpose:
  - Capture staged/manual validation placeholders plus deterministic E2E iteration outcomes.
  - Record root causes and fixes from the stop-on-first-failure regression loop.
  - Keep the artifact safe to share by avoiding secrets/tokens/cookies/raw sensitive payloads.
-->
# Step 22.7 QA Report (Scheduling Efficiency + ZoomLink) - STAGING

## Metadata
- STAGING base URL: `https://eduhub-staging.vercel.app`
- Commit SHA: `1697c8deab122d40d759066e0ce78e268c32d5cf`
- Date/Time (America/Edmonton): `2026-02-12 18:39:11`
- QA operator: `Codex`
- Tenant slug tested (primary): `e2e-testing`
- Secondary tenant slug: `e2e-testing-secondary`
- Auth strategy used: `Option A (deterministic login + Playwright storageState)`
- Scope version: `Step 22.7`

## Manual Validation Checklist (STAGING)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Admin generation flow enforces Preview -> Commit | Pending manual | Covered by E2E; still keep staging manual spot-check. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Preview shows count/range/duplicate/conflict summary (no large ID dump) | Pending manual | Covered by E2E response-shape checks. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Bulk cancel requires reason and succeeds for selected sessions | Pending manual | Covered by API + UI validation checks in E2E. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Group detail sync button runs and returns sync summary | Pending manual | Covered by E2E sync invocation + roster assertion. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Admin session detail supports Zoom link create/edit | Pending manual | Covered by E2E deterministic zoom fixture checks. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Tutor session detail shows Zoom link read-only | Pending manual | Covered by role-scoped tutor detail checks. | `tests/e2e/tutor/zoomlink-visibility.spec.ts` |
| Parent session detail shows Zoom link read-only only for linked students | Pending manual | Covered by parent linked/unlinked access tests. | `tests/e2e/portal/zoomlink-visibility.spec.ts` |
| Canceled session UX in parent portal is clear and actionable | Pending manual | Outside Step 22.7 strict scope; needs explicit staging UX pass. | `<manual-run>` |

## Feature Validation Checklist (Automated E2E)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Generator preview returns deterministic counts and commit consistency | Pass | Preview and commit aligned in seeded window; response checks deterministic. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Bulk cancel blocks empty reason and persists reasonCode | Pass | Server rejects missing reason and stores reason code. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Group roster sync updates future-session snapshots to match group roster additions | Pass | Future session roster set matches group roster after sync call. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Zoom link visibility works for Admin/Tutor/Parent linked flows | Pass | Admin sets, tutor/parent linked views can read; read-only surfaces validated. | `tests/e2e/admin/scheduling-efficiency.spec.ts`, `tests/e2e/tutor/zoomlink-visibility.spec.ts`, `tests/e2e/portal/zoomlink-visibility.spec.ts` |
| Non-involved Tutor/Parent access is blocked or field hidden | Pass | Non-assigned/non-linked and cross-tenant probes blocked. | `tests/e2e/tutor/zoomlink-visibility.spec.ts`, `tests/e2e/portal/zoomlink-visibility.spec.ts` |

## Security / RBAC / Tenant Checklist (P0)
| Check | Pass/Fail | Notes | Evidence |
| --- | --- | --- | --- |
| Cross-tenant blocked for generate preview/commit, bulk cancel, and group sync | Pass | Step 22.7 admin endpoint probes return denied statuses. | `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Tutor cannot read sessions not assigned to them | Pass | Tutor API probe on other tutor session blocked. | `tests/e2e/tutor/zoomlink-visibility.spec.ts` |
| Parent cannot read sessions for unlinked students | Pass | Parent unlinked + cross-tenant probes blocked. | `tests/e2e/portal/zoomlink-visibility.spec.ts` |
| No tokens/cookies/auth headers/password/secret/smtp in Step 22.7 responses | Pass | Response scanner asserts denylist absent from captured payloads. | `tests/e2e/helpers/security.ts` |
| Internal sentinel `INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_LEAK` absent from safe payloads/audit | Pass | Sentinel seeded and asserted absent in tutor/parent-safe payloads. | `tests/e2e/helpers/security.ts`, `tests/e2e/helpers/e2eTenant.ts` |
| No full zoomLink leaked in audit metadata/log payloads | Pass | Audit checks assert safe metadata shape without sensitive leakage. | `tests/e2e/admin/scheduling-efficiency.spec.ts`, `tests/e2e/helpers/security.ts` |

## E2E Iteration Log (`pnpm e2e:full`)
<!--
  Record each stop-on-first-failure iteration using:
  pnpm e2e:full -- --max-failures=1 --workers=1
-->
| Iteration | Timestamp | Command | Result | First Failing Spec/Test | Root-Cause Category | Fix Applied |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | go-live parent navigation | Seed/Auth fixture drift | Ensured deterministic parent fixture creation/linkage in `tests/e2e/helpers/go-live.ts`. |
| 2 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | parent zoomlink cross-tenant check | Routing helper mismatch | Switched to tenant-explicit URL builder in parent spec. |
| 3 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | audit-log-export key mutation test | API contract drift | Removed legacy `dryRun` key from generator commit payload. |
| 4 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | groups CRUD sync action | UI flow drift (new confirm) | Added confirmation-step handling in `tests/e2e/admin/groups.crud.spec.ts`. |
| 5 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | scheduling-efficiency preview test | i18n-sensitive selector | Removed brittle locale text assertion; used response/state assertions. |
| 6 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | scheduling-efficiency cross-tenant test | Routing helper mismatch | Updated cross-tenant probes to use `buildTenantUrl(...)`. |
| 7 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | scheduling-efficiency bulk-cancel UI path | Selection/pagination flake | Stabilized around deterministic API assertions plus required-reason contract. |
| 8 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | sessions.generator spec | API contract drift | Migrated test flow to preview endpoint + commit response contract. |
| 9 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | sessions.spec recurring flow | Selector contract drift | Replaced removed `generator-preview-count` assertions with response checks. |
| 10 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | sessions.spec one-off flow | Selector mismatch | Corrected one-off modal selectors to `sessions-one-off-*` ids. |
| 11 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Fail | tutor zoomlink list+detail | Seed-window mismatch | Expanded tutor date filter window before row assertion in `tests/e2e/tutor/zoomlink-visibility.spec.ts`. |
| 12 | 2026-02-12 | `pnpm e2e:full -- --max-failures=1 --workers=1` | Pass | N/A | N/A | Stop-on-first loop green (`144 passed`, `5 skipped`, `0 failed`). |

## Issues Found + Resolutions
| Severity | Issue | Detection | Resolution | Evidence |
| --- | --- | --- | --- | --- |
| High | Legacy generator tests still used pre-Step-22.7 payload shape (`dryRun`) | Stop-on-first E2E failures in admin audit/generator specs | Updated tests to use preview endpoint and new commit summary contract | `tests/e2e/admin/audit-log-export.spec.ts`, `tests/e2e/admin/sessions.generator.spec.ts` |
| High | Cross-tenant assertions were route-helper dependent and could silently test same tenant | Parent/admin Step 22.7 RBAC failures | Normalized to tenant-explicit URL helpers for probes | `tests/e2e/portal/zoomlink-visibility.spec.ts`, `tests/e2e/admin/scheduling-efficiency.spec.ts` |
| Medium | UI contract added confirms and removed old preview test id; old selectors flaked | groups/sessions regression failures | Updated tests to current modal and preview response patterns | `tests/e2e/admin/groups.crud.spec.ts`, `tests/e2e/admin/sessions.spec.ts` |
| Medium | Tutor zoom-link list assertion ignored default 7-day date filter | tutor zoomlink failure at iteration 11 | Expanded filter window deterministically before row assertion | `tests/e2e/tutor/zoomlink-visibility.spec.ts` |
| Medium | Seed determinism drift for parent fixture under full-suite reseed | first loop failure in go-live parent navigation | Added deterministic parent fixture + linkage guarantees | `tests/e2e/helpers/go-live.ts`, `tests/e2e/helpers/e2eTenant.ts` |

## QA Decision
- Decision: `GO (Automated E2E gate)`
- Rationale: Step 22.7 target coverage added; stop-on-first full loop is green and static checks pass.
- Follow-ups: Run staging manual UX checklist rows marked `Pending manual` before release sign-off.

## Artifact / Log Links
- CI job link: `<pending>`
- Playwright HTML report: `playwright-report/index.html`
- Attached run logs: `test-results/**`, terminal output from local stop-on-first loop
