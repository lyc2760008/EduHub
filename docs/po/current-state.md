<!-- Curated snapshot for PO planning. Keep secrets out; update via scripts/generate-current-state.mjs. -->
# EduHub Current State Snapshot

Last updated: 2026-02-10

Owners:
- Dev: TODO (name)
- QA: TODO (name)
- DevOps: TODO (name)

How to use: Paste this doc before PO planning.

Change log:
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
- Tests live under `tests/e2e/` with admin, portal, smoke, golden, and go-live suites.
- Admin flows covered (best-effort from filenames): users, students, groups, catalog, sessions, attendance, audit log, reports, navigation, RBAC/tenant isolation.
- Parent portal flows covered (best-effort from filenames): auth, onboarding, sessions detail, requests lifecycle, access control, i18n, tenant isolation, logout.
- TODO: confirm coverage gaps and update with definitive list.

---

**DevOps-Owned**

## Deploy/Env/Migrations (NAMES only)
- Deploy/runbook docs: `docs/devops/deploy-runbook.md`, `docs/devops/vercel-neon-deploy.md`, `docs/ops/deployment.md`.
- Observability docs: `docs/devops/observability.md`, `docs/ops/observability.md`.
- DB/ops runbooks: `docs/ops/db-runbook.md`, `docs/ops/tenant-provisioning.md`.
- Env var names (from `.env.example`, values omitted):
- APP_ENV, NODE_ENV, PORT, TENANT_BASE_DOMAIN, TENANT_DEV_BASE_DOMAIN, DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, SEED_OWNER_PASSWORD, SEED_DEFAULT_PASSWORD, SEED_DEMO_TENANT_SLUG, SEED_DEMO_TENANT_NAME, SEED_SECOND_TENANT_SLUG, SEED_SECOND_TENANT_NAME, SEED_OWNER_EMAIL, SEED_TUTOR_EMAIL, SEED_PARENT_EMAIL, SEED_ACME_OWNER_EMAIL, SEED_OWNER_NAME, SEED_TUTOR_NAME, SEED_PARENT_NAME, SEED_ACME_OWNER_NAME, SEED_TUTOR_PASSWORD, SEED_PARENT_PASSWORD, SEED_ACME_OWNER_PASSWORD, E2E_BASE_URL, E2E_TENANT_SLUG, E2E_RUN_ID, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TUTOR_EMAIL, E2E_TUTOR_PASSWORD, BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA, BROWSERSLIST_IGNORE_OLD_DATA, AUTH_SECRET, AUTH_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE, EMAIL_FROM, MAGIC_LINK_TTL_MINUTES, AUTH_RATE_LIMIT_EMAIL_MAX, AUTH_RATE_LIMIT_EMAIL_WINDOW_MINUTES, AUTH_RATE_LIMIT_IP_MAX, AUTH_RATE_LIMIT_IP_WINDOW_MINUTES.
- TODO: confirm migration procedures (see `docs/devops/seeding-staging.md` and `scripts/devops/`).

---

## Known Gaps / Planned Next (non-commitment)
- TODO: confirm remaining PO roadmap items and link to step docs in `docs/release/`.
- TODO: confirm any portal/account/help gaps from design/QA feedback.

## Update Procedure
- Run `pnpm docs:state`.
- Review `docs/po/current-state.generated.md` for accuracy.
- Merge relevant details into this curated doc.
- Update “Last updated” and Change log entry.
