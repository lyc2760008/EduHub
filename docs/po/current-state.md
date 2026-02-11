<!-- Curated snapshot for PO planning. Keep secrets out; update via scripts/generate-current-state.mjs. -->
# EduHub Current State Snapshot

Last updated: 2026-02-11

Owners:
- Dev: TODO (name)
- QA: TODO (name)
- DevOps: TODO (name)

How to use: Paste this doc before PO planning.

Change log:
- 2026-02-11: QA — Step 22.2 QA automation coverage updated (admin invite/resend), E2E status refreshed from STAGING run.
- 2026-02-10: DevOps — Refresh DevOps deploy/env/migrations snapshot (staging+prod), add runbook paths + env var names.
- 2026-02-10: Dev — Step 22.2 admin send/resend parent magic link from Student Detail parents section; shared helper + admin endpoint.
- 2026-02-10: Initial snapshot scaffold seeded from repo scan.

---

**Dev-Owned**

## Implemented Feature Inventory (Steps)
- TODO: confirm Step ID — Admin dashboard + quick links. Routes: `/[tenant]/admin`.
- TODO: confirm Step ID — People management (students/parents/staff). Routes: `/[tenant]/admin/students`, `/[tenant]/admin/students/[id]`, `/[tenant]/admin/parents`, `/[tenant]/admin/users`.
- TODO: confirm Step ID — Catalog & setup (centers, groups, programs, subjects, levels). Routes: `/[tenant]/admin/catalog`, `/[tenant]/admin/centers`, `/[tenant]/admin/groups`, `/[tenant]/admin/groups/[id]`, `/[tenant]/admin/programs`, `/[tenant]/admin/subjects`, `/[tenant]/admin/levels`.
- TODO: confirm Step ID — Scheduling & attendance (sessions, notes, attendance tooling). Routes: `/[tenant]/admin/sessions`, `/[tenant]/admin/sessions/[id]`.
- TODO: confirm Step ID — Parent requests workflow (admin review). Routes: `/[tenant]/admin/requests`.
- TODO: confirm Step ID — Reports hub + report pages. Routes: `/[tenant]/admin/reports`, `/[tenant]/admin/reports/upcoming-sessions`, `/[tenant]/admin/reports/attendance-summary`, `/[tenant]/admin/reports/absence-requests`, `/[tenant]/admin/reports/tutor-workload`, `/[tenant]/admin/reports/students-directory`.
- TODO: confirm Step ID — Audit log visibility. Routes: `/[tenant]/admin/audit`.
- TODO: confirm Step ID — Admin help hub. Routes: `/[tenant]/admin/help`.
- TODO: confirm Step ID — Parent portal home + sessions + requests + students. Routes: `/[tenant]/portal`, `/[tenant]/portal/sessions`, `/[tenant]/portal/sessions/[id]`, `/[tenant]/portal/requests`, `/[tenant]/portal/students`, `/[tenant]/portal/students/[id]`.
- TODO: confirm Step ID — Parent portal account/help views. Routes: `/[tenant]/portal/account`, `/[tenant]/portal/help`.
- TODO: confirm Step ID — Parent auth (magic link + verify). Routes: `/[tenant]/parent/login`, `/[tenant]/parent/auth/verify`.
<!-- Step 22.2: Admin send/resend parent magic link from Student Detail parents section. -->
- Step 22.2 — Admin parent magic link invite/resend from Student Detail → Parents section. Route: `/[tenant]/admin/students/[id]`. Endpoint: `src/app/api/parents/[parentId]/send-magic-link/route.ts`. Shared helper: `src/lib/auth/parentMagicLink.ts`.

## Route Inventory

Parent routes (app/[tenant]/(parent)/...):
| Path | Description | Access control summary | i18n status |
| --- | --- | --- | --- |
| `/[tenant]/parent` | Parent landing shell (TODO: confirm actual behavior) | `src/app/[tenant]/(parent)/parent/layout.tsx` uses `requireParentAccess` from `src/lib/rbac/parent.ts`. | TODO: confirm (likely next-intl in child pages). |
| `/[tenant]/portal` | Parent portal dashboard/home. | `src/app/[tenant]/(parent)/portal/layout.tsx` uses `requireParentAccess` from `src/lib/rbac/parent.ts`. | TODO: confirm (likely next-intl). |
| `/[tenant]/portal/sessions` | Parent sessions list + filters. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |
| `/[tenant]/portal/sessions/[id]` | Parent session detail + attendance/notes. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |
| `/[tenant]/portal/requests` | Parent requests list. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |
| `/[tenant]/portal/students` | Parent students overview. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |
| `/[tenant]/portal/students/[id]` | Parent student detail. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |
| `/[tenant]/portal/account` | Parent account view. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |
| `/[tenant]/portal/help` | Parent help/support view. | Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`). | TODO: confirm (uses `next-intl` in UI). |

Admin routes (app/[tenant]/(admin)/...):
| Path | Description | Access control summary | i18n status |
| --- | --- | --- | --- |
| `/[tenant]/admin` | Admin dashboard/home. | Admin layout uses `requirePageRole` (`src/app/[tenant]/(admin)/layout.tsx`, `src/components/admin/shared/AdminAccessGate.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/users` | Staff/users list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`) + server RBAC helpers in `src/lib/rbac`. | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/students` | Students list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/students/[id]` | Student detail. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/parents` | Parents list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/centers` | Centers list + create/edit. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/groups` | Groups/classes list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/groups/[id]` | Group detail. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/programs` | Programs list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/subjects` | Subjects list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/levels` | Levels list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/sessions` | Sessions list + actions. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/sessions/[id]` | Session detail. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/requests` | Parent absence requests review. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/audit` | Audit log list. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/help` | Admin help page. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/catalog` | Catalog hub page. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/reports` | Reports hub. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/reports/upcoming-sessions` | Upcoming sessions report. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/reports/attendance-summary` | Attendance summary report. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/reports/absence-requests` | Absence requests report. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/reports/tutor-workload` | Tutor workload report. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |
| `/[tenant]/admin/reports/students-directory` | Students directory report. | Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`). | TODO: confirm (likely next-intl). |

Public/Auth routes (app/...):
| Path | Description | Access control summary | i18n status |
| --- | --- | --- | --- |
| `/` | Public landing or redirect (TODO: confirm). | TODO: confirm (see `src/app/page.tsx`). | TODO: confirm. |
| `/[tenant]/login` | Staff/admin login. | Auth handled by NextAuth credentials (`src/lib/auth/options.ts`). | TODO: confirm (likely next-intl). |
| `/[tenant]/parent/login` | Parent magic link login request. | Auth handled by NextAuth parent credentials (`src/lib/auth/options.ts`). | TODO: confirm (likely next-intl). |
| `/[tenant]/parent/auth/verify` | Parent magic link verification. | Auth handled by NextAuth parent credentials (`src/lib/auth/options.ts`). | TODO: confirm (likely next-intl). |

## Navigation Map
Admin shell/nav sources:
- `src/lib/nav/adminNavTree.ts` (admin sidebar/drawer nav tree; RBAC-aware groups and items).
- `src/components/admin/shell/AdminShell.tsx` (renders the sidebar + top bar using nav tree).
- `src/components/admin/AdminNav.tsx` (compact admin nav for page-level navigation).

Admin nav items (from `src/lib/nav/adminNavTree.ts`):
- Dashboard ? `/admin`.
- People group ? `/admin/students`, `/admin/parents`, `/admin/users`.
- Setup group ? `/admin/centers`, `/admin/groups`, `/admin/programs`, `/admin/subjects`, `/admin/levels`.
- Operations group ? `/admin/sessions`, `/admin/requests`, `/admin/audit`, `/admin/help`.
- Reports group ? `/admin/reports` + report subroutes.

Parent shell/nav sources:
- `src/components/parent/ParentShell.tsx` (portal shell wrapper).
- `src/components/parent/PortalTopNav.tsx` (parent portal top navigation items).

Parent nav items (from `src/components/parent/PortalTopNav.tsx`):
- Dashboard ? `/[tenant]/portal`.
- Students ? `/[tenant]/portal/students`.
- Sessions ? `/[tenant]/portal/sessions`.
- Requests ? `/[tenant]/portal/requests`.

Duplicate/ambiguous nav labels to confirm:
- `/admin/reports` appears as both the Reports group href and a report item in `src/lib/nav/adminNavTree.ts` (confirm intended behavior).

## Auth & Sessions (as implemented)
- Parent auth uses magic links with remember-me handling via NextAuth credentials (`src/lib/auth/options.ts`) and parent auth endpoints under `src/app/[tenant]/api/parent-auth/magic-link/*`.
- Staff/admin auth uses NextAuth credentials with tenant membership check (`src/lib/auth/options.ts`).
- Parent portal access guard uses `requireParentAccess` (`src/lib/rbac/parent.ts`) in parent/portal layouts.
- Admin page guard uses `requirePageRole` (`src/lib/rbac/page.ts`) + `AdminAccessGate` (`src/components/admin/shared/AdminAccessGate.tsx`).
- Session max age (high-level):
- Global JWT maxAge configured at 90 days (`src/lib/auth/options.ts`).
- Parent sessions: 90 days when remember-me is true, 7 days when remember-me is false (`src/lib/auth/options.ts`).
- Staff sessions: 30 days (`src/lib/auth/options.ts`).

## Data Model Highlights (high-level)
- Tenant isolation: tenant-scoped models include `tenantId` on nearly all domain models (`prisma/schema.prisma`).
- Key parent portal models: `Tenant`, `Parent`, `Student`, `StudentParent`, `Session`, `SessionStudent`, `Attendance`, `SessionNote`, `ParentRequest`, `ParentMagicLinkToken` (`prisma/schema.prisma`).
- Tenant membership links staff users to tenants with roles in `TenantMembership` (`prisma/schema.prisma`).

## RBAC & Tenant Isolation Enforcement Points
- Tenant resolution helper: `src/lib/tenant/resolveTenant.ts`.
- Server RBAC gate for API routes: `src/lib/rbac/index.ts` (`requireRole`).
- Server RBAC gate for server pages: `src/lib/rbac/page.ts` (`requirePageRole`).
- Parent portal session guard: `src/lib/rbac/parent.ts` (`requireParentAccess`).
- Parent portal context helper: `src/lib/portal/parent.ts` (tenant + parent scoping).

---

**QA-Owned**

## Test Coverage Status (Playwright)
<!-- Step 22.2 QA coverage snapshot: keep this section focused on verified automation behavior. -->
- Tests live under `tests/e2e/` with `setup-admin`, `setup-parent`, `smoke`, `portal`, `admin`, `golden`, and `go-live` projects.
- Step 22.2 invite/resend automated coverage: `tests/e2e/admin/parent-magic-link-invite.admin.spec.ts`.
- Step 22.2 covered cases:
- Admin can trigger send-link from Student Detail -> Parents; backend response is asserted (`200` or `409`) and success feedback toast is visible.
- Missing-email parent row renders disabled send-link action with helper text.
- Non-admin (Tutor) is blocked at UI (access denied) and API (`401/403`) for invite endpoint.
- Cross-tenant Student Detail navigation is blocked (best-effort tenant isolation assertion).
- i18n guard: Step 22.2 spec asserts no raw `adminParentAuth.*` key leakage in rendered UI.
- No real inbox dependency in E2E automation: auth/login flows use deterministic test auth helpers and guarded test endpoint flows where required.

## Current E2E Status
<!-- Update this after each QA automation pass so PO has an at-a-glance quality signal. -->
- Last full run date: 2026-02-11 (America/Edmonton).
- Target: `https://eduhub-staging.vercel.app` (tenant `e2e-testing`).
- Command: `pnpm e2e:full`.
- Result: `108 passed`, `6 skipped`, `0 failed`.
- Skip notes: skipped specs are conditional go-live/tenant-data scenarios and are expected in this STAGING profile.

---

**DevOps-Owned**

## Deploy/Env/Migrations (NAMES only)
<!-- DevOps snapshot: update from docs/ops/env-vars.md, .env files, and process.env usage; names only. -->
- Environments (high level): Staging + production run the Next.js app on Vercel with Neon Postgres; deploys are staging-first before production.
- Deploy/runbook docs: `docs/devops/deploy-runbook.md`, `docs/devops/vercel-neon-deploy.md`, `docs/devops/incident-triage.md`, `docs/devops/observability.md`, `docs/devops/seeding-staging.md`, `docs/ops/deployment.md`, `docs/ops/db-runbook.md`, `docs/ops/tenant-provisioning.md`, `docs/ops/env-vars.md`, `docs/ops/observability.md`.
- Env var names (shared across envs): APP_ENV, AUTH_RATE_LIMIT_EMAIL_MAX, AUTH_RATE_LIMIT_EMAIL_WINDOW_MINUTES, AUTH_RATE_LIMIT_IP_MAX, AUTH_RATE_LIMIT_IP_WINDOW_MINUTES, AUTH_SECRET, AUTH_URL, BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA, BROWSERSLIST_IGNORE_OLD_DATA, DATABASE_URL, DIRECT_URL, EMAIL_FROM, GIT_COMMIT_SHA, MAGIC_LINK_TTL_MINUTES, NEXT_PUBLIC_APP_ENV, NEXT_PUBLIC_SENTRY_DSN, NEXT_RUNTIME, NEXTAUTH_SECRET, NEXTAUTH_URL, NODE_ENV, PORT, SENTRY_DSN, SENTRY_RELEASE, SENTRY_TRACES_SAMPLE_RATE, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURE, SMTP_USER, TENANT_BASE_DOMAIN, TENANT_DEV_BASE_DOMAIN, VERCEL_GIT_COMMIT_SHA.
- Env var names (env-specific / QA / local): E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_BASE_URL, E2E_GO_LIVE_SESSION_ID, E2E_GO_LIVE_STUDENT_ID, E2E_RUN_ID, E2E_TENANT_SLUG, E2E_TUTOR_EMAIL, E2E_TUTOR_PASSWORD, NEW_PASSWORD, SEED_ACME_OWNER_EMAIL, SEED_ACME_OWNER_NAME, SEED_ACME_OWNER_PASSWORD, SEED_ADMIN_EMAIL, SEED_DEFAULT_PASSWORD, SEED_DEMO_TENANT_NAME, SEED_DEMO_TENANT_SLUG, SEED_OWNER_EMAIL, SEED_OWNER_NAME, SEED_OWNER_PASSWORD, SEED_PARENT_EMAIL, SEED_PARENT_NAME, SEED_PARENT_PASSWORD, SEED_PARENT_TWO_EMAIL, SEED_SECOND_TENANT_NAME, SEED_SECOND_TENANT_SLUG, SEED_TUTOR_EMAIL, SEED_TUTOR_NAME, SEED_TUTOR_PASSWORD, SEED_TUTOR_TWO_EMAIL.
- Migration/deploy notes (high level): Prisma migrations via `pnpm prisma migrate deploy`, staging-first with a QA gate before production; rollback is app-first. Tenant isolation + RBAC are P0 in deploy/migration validation.

---

## Known Gaps / Planned Next (non-commitment)
- TODO: confirm remaining PO roadmap items and link to step docs in `docs/release/`.
- TODO: confirm any portal/account/help gaps from design/QA feedback.

## Update Procedure
- Run `pnpm docs:state`.
- Review `docs/po/current-state.generated.md` for accuracy.
- Merge relevant details into this curated doc.
- Update “Last updated” and Change log entry.


