<!-- Curated snapshot for PO planning. Keep secrets out; update via scripts/generate-current-state.mjs. -->

Planning Inputs (must read): duplication-risk.md + capability-matrix.md

# EduHub Current State Snapshot

Last updated: 2026-02-11

Owners:

- Dev: TODO (name)
- QA: TODO (name)
- DevOps: TODO (name)

How to use: Paste this doc before PO planning.

Change log:

- 2026-02-11: Dev — Step 22.4 implemented Tutor Session Execution Pack v1 (My Sessions + Run Session) with tutor-only RBAC, server-scoped APIs, and attendance + parent-visible note save flow.
- 2026-02-11: Dev — Step 22.3 implemented parent Student Detail Progress Notes timeline (v1), read-only with parent-visible note scoping.
- 2026-02-11: Dev — Repo-intel delta merge: added explicit capability statements (parent landing redirect, onboarding dismiss, request resolve, session generate, group future sync, invite-copy audit, tutor scoped operations) and marked unconfirmed claims as UNKNOWN/TODO.
- 2026-02-11: Dev — Step 0.1 upgraded Current State Snapshot to v2 (route capabilities + @state annotations + generator heuristics).
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
- TODO: confirm Step ID — Parent auth success landing. Route: `/[tenant]/parent`. Capability: `view:list` (parent landing that links to `/[tenant]/portal`).
- TODO: confirm Step ID — Parent onboarding dismissal. Endpoint: `/api/portal/onboarding/dismiss`. Capability: `onboarding:dismiss_welcome` (updates `Parent.hasSeenWelcome`).
- TODO: confirm Step ID — Admin request resolution action. Endpoint: `/api/requests/[id]/resolve`. Capability: `request:resolve` (approve/decline pending absence request).
- TODO: confirm Step ID — Session generation action. Endpoint: `/api/sessions/generate`. Capability: `session:create_generate_batch`.
- TODO: confirm Step ID — Group future-session roster sync. Endpoint: `/api/groups/[id]/sync-future-sessions`. Capability: `session_roster:sync_future`.
- TODO: confirm Step ID — Parent invite copy audit action. Endpoint: `/api/admin/students/[id]/invite-copied`. Capability: `parent_invite:audit_copy`.
- TODO: confirm Step ID — Tutor-scoped shared operations enforcement. Endpoints: `/api/sessions`, `/api/sessions/[id]/attendance`, `/api/sessions/[id]/notes`. Capability: `tutor_scope:own_sessions_only`.
<!-- Step 22.2: Admin send/resend parent magic link from Student Detail parents section. -->
- Step 22.2 — Admin parent magic link invite/resend from Student Detail → Parents section. Route: `/[tenant]/admin/students/[id]`. Endpoint: `src/app/api/parents/[parentId]/send-magic-link/route.ts`. Shared helper: `src/lib/auth/parentMagicLink.ts`.
<!-- Step 22.3: Parent Student Detail progress notes timeline (read-only) -->
- Step 22.3 — Parent Student Detail now includes Progress Notes timeline (v1). Route: `/[tenant]/portal/students/[id]`. Endpoint: `src/app/api/portal/students/[id]/progress-notes/route.ts`. Data source: `Attendance.parentVisibleNote` (parent-visible only).
<!-- Step 22.4: Tutor Session Execution Pack v1 (My Sessions + Run Session). -->
- Step 22.4 — Tutor Session Execution Pack v1 shipped with tutor-only routes `/[tenant]/tutor/sessions` and `/[tenant]/tutor/sessions/[id]`, plus tutor APIs for scoped list/detail/save under `src/app/[tenant]/api/tutor/sessions/*`. Tutors can edit only attendance status (`PRESENT/ABSENT/LATE/EXCUSED`) and `Attendance.parentVisibleNote` (parent-visible note only).

## Route Inventory

This section now tracks route-level capabilities (v2). Full inventory + file evidence is generated in `docs/po/current-state.generated.md`.

Parent routes (app/[tenant]/(parent)/...):

- Path: `/[tenant]/parent`
  - Description: Parent post-verify landing page.
  - Capabilities:
  - `view:list`
  - Access control summary: Parent layout guard (`src/app/[tenant]/(parent)/parent/layout.tsx`, `requireParentAccess`).
- Path: `/[tenant]/portal`
  - Description: Parent portal dashboard/home.
  - Capabilities:
  - `view:list`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`, `requireParentAccess`).
- Path: `/[tenant]/portal/sessions`
  - Description: Parent sessions list + filters.
  - Capabilities:
  - `view:list`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).
- Path: `/[tenant]/portal/sessions/[id]`
  - Description: Parent session detail with absence workflow.
  - Capabilities:
  - `view:detail`
  - `report_absence:create_request`
  - `request:withdraw`
  - `request:resubmit`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).
- Path: `/[tenant]/portal/requests`
  - Description: Parent requests list/status.
  - Capabilities:
  - `view:list`
  - `report_absence:create_request`
  - `request:withdraw`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).
- Path: `/[tenant]/portal/students`
  - Description: Parent students overview.
  - Capabilities:
  - `view:list`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).
- Path: `/[tenant]/portal/students/[id]`
  - Description: Parent student detail.
  - Capabilities:
  - `view:detail`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).
- Path: `/[tenant]/portal/account`
  - Description: Parent account view.
  - Capabilities:
  - `view:list`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).
- Path: `/[tenant]/portal/help`
  - Description: Parent help/support view.
  - Capabilities:
  - `view:list`
  - Access control summary: Parent portal layout guard (`src/app/[tenant]/(parent)/portal/layout.tsx`).

Tutor routes (app/[tenant]/tutor/...):

- Path: `/[tenant]/tutor/sessions`
  - Description: Tutor My Sessions list (upcoming window + date range + run action).
  - Capabilities:
  - `view:list`
  - Access control summary: Tutor layout guard (`src/app/[tenant]/tutor/layout.tsx`, `requireTutorContextOrThrow`).
- Path: `/[tenant]/tutor/sessions/[id]`
  - Description: Tutor Run Session attendance + parent-visible notes.
  - Capabilities:
  - `view:detail`
  - `update:attendance`
  - Access control summary: Tutor layout guard + tutor-scoped APIs (`src/app/[tenant]/api/tutor/sessions/[id]/route.ts`, `src/app/[tenant]/api/tutor/sessions/[id]/save/route.ts`).

Admin routes (app/[tenant]/(admin)/...):

- Path: `/[tenant]/admin`
  - Description: Admin dashboard/home.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout + `AdminAccessGate` with `requirePageRole`.
- Path: `/[tenant]/admin/students`
  - Description: Students list.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/students/[id]`
  - Description: Student detail + parent link management.
  - Capabilities:
  - `view:detail`
  - `parent_invite:send_signin_link`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/groups`
  - Description: Groups/classes list.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/groups/[id]`
  - Description: Group detail (tutor/student roster management).
  - Capabilities:
  - `view:detail`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/sessions`
  - Description: Sessions list + scheduling actions.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/sessions/[id]`
  - Description: Session detail (attendance + notes).
  - Capabilities:
  - `view:detail`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/requests`
  - Description: Parent absence requests review.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/reports`
  - Description: Reports hub.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).
- Path: `/[tenant]/admin/audit`
  - Description: Audit log list.
  - Capabilities:
  - `view:list`
  - Access control summary: Admin layout guard (`src/app/[tenant]/(admin)/layout.tsx`).

Public/Auth routes (app/...):

- Path: `/`
  - Description: Public landing/health indicator.
  - Capabilities:
  - `view:list`
  - Access control summary: Public route (`src/app/page.tsx`).
- Path: `/[tenant]/login`
  - Description: Staff/admin login.
  - Capabilities:
  - `view:list`
  - Access control summary: NextAuth credentials flow (`src/lib/auth/options.ts`).
- Path: `/[tenant]/parent/login`
  - Description: Parent sign-in request entry.
  - Capabilities:
  - `view:list`
  - Access control summary: NextAuth parent flow (`src/lib/auth/options.ts`).
- Path: `/[tenant]/parent/auth/verify`
  - Description: Parent magic-link verification view.
  - Capabilities:
  - `UNKNOWN/TODO` (previously documented as `view:detail`; route annotation currently reports `view:list`; finalize capability taxonomy)
  - Access control summary: NextAuth parent flow (`src/lib/auth/options.ts`).

Key API capabilities (explicit, code-verified):

- Path: `/api/portal/onboarding/dismiss`
  - Capability: `onboarding:dismiss_welcome`
  - Evidence: `src/app/api/portal/onboarding/dismiss/route.ts` (`POST`, `prisma.parent.updateMany`).
- Path: `/api/requests/[id]/resolve`
  - Capability: `request:resolve` (approve/decline pending request)
  - Evidence: `src/app/api/requests/[id]/resolve/route.ts` (`POST`, `prisma.parentRequest.updateMany`).
- Path: `/api/sessions/generate`
  - Capability: `session:create_generate_batch`
  - Evidence: `src/app/api/sessions/generate/route.ts` (`POST`, transaction with `session.create` + `sessionStudent.createMany`).
- Path: `/api/groups/[id]/sync-future-sessions`
  - Capability: `session_roster:sync_future`
  - Evidence: `src/app/api/groups/[id]/sync-future-sessions/route.ts` (`POST`, `sessionStudent.createMany`).
- Path: `/api/admin/students/[id]/invite-copied`
  - Capability: `parent_invite:audit_copy`
  - Evidence: `src/app/api/admin/students/[id]/invite-copied/route.ts` (`POST`), called by `src/components/admin/students/StudentDetailClient.tsx`.

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

Tutor shell/nav sources:

- `src/components/tutor/TutorShell.tsx` (tutor shell wrapper + tutor nav link).
- `src/lib/nav/adminNavTree.ts` (admin shell handoff nav entry `admin.nav.tutorMySessions` visible to Tutor role).

Tutor nav items:

- My Sessions ? `/[tenant]/tutor/sessions`.

Duplicate/ambiguous nav labels to confirm:

- `/admin/reports` appears as both the Reports group href and a report item in `src/lib/nav/adminNavTree.ts` (confirm intended behavior).

## Auth & Sessions (as implemented)

- Parent auth uses magic links with remember-me handling via NextAuth credentials (`src/lib/auth/options.ts`) and parent auth endpoints under `src/app/[tenant]/api/parent-auth/magic-link/*`.
- Parent verify flow consumes token via server action and redirects to `/[tenant]/parent` before portal navigation (`src/app/[tenant]/(parent-auth)/parent/auth/verify/_actions/consumeParentMagicLink.ts`).
- Staff/admin auth uses NextAuth credentials with tenant membership check (`src/lib/auth/options.ts`).
- Parent portal access guard uses `requireParentAccess` (`src/lib/rbac/parent.ts`) in parent/portal layouts.
- Admin page guard uses `requirePageRole` (`src/lib/rbac/page.ts`) + `AdminAccessGate` (`src/components/admin/shared/AdminAccessGate.tsx`).
- Tutor page guard uses `requireTutorContextOrThrow` (`src/lib/tutor/guard.ts`) in `src/app/[tenant]/tutor/layout.tsx`.
- Tutor permissions on shared operations APIs are ownership-scoped (`READ_ROLES` + `tutorId` filtering/checks) in sessions/attendance/notes endpoints (`src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/attendance/route.ts`, `src/app/api/sessions/[id]/notes/route.ts`).
- Tutor-specific session execution APIs are ownership-scoped and tenant-safe in `src/app/[tenant]/api/tutor/sessions/route.ts`, `src/app/[tenant]/api/tutor/sessions/[id]/route.ts`, and `src/app/[tenant]/api/tutor/sessions/[id]/save/route.ts`.
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

- Verification artifact link: `UNKNOWN/TODO` (required before treating this section as authoritative).
- Last full run date (artifact-verified): `UNKNOWN/TODO`.
- Target (artifact-verified): `UNKNOWN/TODO`.
- Command (artifact-verified): `UNKNOWN/TODO`.
- Result (artifact-verified): `UNKNOWN/TODO`.
- Last reported values (not artifact-verified in this doc revision): 2026-02-11 (America/Edmonton), target `https://eduhub-staging.vercel.app`, command `pnpm e2e:full`, result `108 passed / 6 skipped / 0 failed`.

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
