# Current State Deltas

Comparison target: `docs/po/current-state.md` vs repository code (`src/app/**`, `src/lib/**`, Prisma writes).

## 1) Missing in `current-state.md` (but implemented in code)

### A. Parent landing route exists and is part of auth flow
- Implemented capability:
  - `view:list parent_landing` on `/[tenant]/parent`
- Where:
  - `src/app/[tenant]/(parent)/parent/page.tsx` (`ParentLandingPage`)
  - `src/app/[tenant]/(parent-auth)/parent/auth/verify/_actions/consumeParentMagicLink.ts` (`consumeParentMagicLinkToken`, redirects to `/${tenantSlug}/parent`)
- Evidence pointers:
  - route/component: `src/app/[tenant]/(parent)/parent/page.tsx`
  - verify redirect target: `src/app/[tenant]/(parent-auth)/parent/auth/verify/_actions/consumeParentMagicLink.ts`
- Suggested sentence to add:
  - "Parent auth success redirects to `/[tenant]/parent` (landing), which links users into `/[tenant]/portal`."

### B. Parent onboarding welcome dismissal is implemented
- Implemented capability:
  - `onboarding:dismiss_welcome` (parent marks welcome card as seen)
- Where:
  - `src/app/api/portal/onboarding/dismiss/route.ts` (`POST`)
  - `src/app/[tenant]/(parent)/portal/page.tsx` (`PortalWelcomeCard` + dismiss action)
- Evidence pointers:
  - mutation: `prisma.parent.updateMany` in `src/app/api/portal/onboarding/dismiss/route.ts`
  - UI trigger: `handleDismissWelcome` in `src/app/[tenant]/(parent)/portal/page.tsx`
- Suggested sentence to add:
  - "Portal dashboard supports first-login welcome-card dismissal via `POST /api/portal/onboarding/dismiss` (updates `Parent.hasSeenWelcome`)."

### C. Admin request resolution action is explicit in code
- Implemented capability:
  - `create resolve` (approve/decline pending parent absence request)
- Where:
  - `src/app/api/requests/[id]/resolve/route.ts` (`POST`)
- Evidence pointers:
  - mutation: `prisma.parentRequest.updateMany`
  - audit write: `writeAuditEvent(...)`
- Suggested sentence to add:
  - "Admin request workflow includes `POST /api/requests/[id]/resolve` to approve/decline pending requests with audit logging."

### D. Group roster backfill for future sessions is implemented
- Implemented capability:
  - `create sync_future_session`
- Where:
  - `src/app/api/groups/[id]/sync-future-sessions/route.ts` (`POST`)
- Evidence pointers:
  - mutation: `prisma.sessionStudent.createMany`
  - guard: `requireRole(req, ADMIN_ROLES)`
- Suggested sentence to add:
  - "Group operations include future-session roster sync (`POST /api/groups/[id]/sync-future-sessions`)."

### E. Session bulk generation endpoint is implemented
- Implemented capability:
  - `create generate`
- Where:
  - `src/app/api/sessions/generate/route.ts` (`POST`)
- Evidence pointers:
  - mutations: `tx.session.create`, `tx.sessionStudent.createMany`
  - guard: `requireRole(req, ADMIN_ROLES)`
- Suggested sentence to add:
  - "Scheduling includes a bulk generation endpoint (`POST /api/sessions/generate`) with transactional session+roster writes."

### F. Invite-copy auditing endpoint exists for student detail parent invites
- Implemented capability:
  - `create invite_copied`
- Where:
  - `src/app/api/admin/students/[id]/invite-copied/route.ts` (`POST`)
  - `src/components/admin/students/StudentDetailClient.tsx` (`handleCopyInvite`)
- Evidence pointers:
  - API handler: `POST`
  - UI caller: `buildTenantApiUrl(.../invite-copied)`
- Suggested sentence to add:
  - "Student Detail parent invite flow logs invite-copy events through `POST /api/admin/students/[id]/invite-copied`."

### G. Tutor-scoped enforcement exists on shared operations APIs
- Implemented capability:
  - tutor can read/write only owned sessions/attendance/notes via shared APIs
- Where:
  - `src/app/api/sessions/route.ts` (`READ_ROLES` includes `Tutor`; `tutorId` filter)
  - `src/app/api/sessions/[id]/attendance/route.ts` (tutor ownership checks)
  - `src/app/api/sessions/[id]/notes/route.ts` (tutor ownership checks)
- Evidence pointers:
  - RBAC + ownership filters in the above handlers
- Suggested sentence to add:
  - "Tutor permissions are enforced in shared session APIs via `READ_ROLES` and tutor ownership filtering (`tutorId = ctx.user.id`)."

## 2) Claimed by `current-state.md` (but not confirmed by code)

### A. Claim: parent verify page capability is `view:detail`
- Claim (close paraphrase):
  - `docs/po/current-state.md` Route Inventory lists `/[tenant]/parent/auth/verify` as `view:detail`.
- Why code cannot confirm:
  - Route annotation and behavior represent a verification flow view (`view:list` in `@state.capabilities`), not an entity detail page.
- Evidence checked:
  - `docs/po/current-state.md`
  - `src/app/[tenant]/(parent-auth)/parent/auth/verify/page.tsx`
- Suggested rewrite:
  - "`/[tenant]/parent/auth/verify` is a magic-link verification view (`view:list`), not a domain detail view."

### B. Claim: latest E2E counts/date in current-state are definitive
- Claim (close paraphrase):
  - `docs/po/current-state.md` states a specific latest full run date and pass/skip/fail counts.
- Why code cannot confirm:
  - Repository code and docs do not contain an immutable run artifact proving this exact latest run in this scan.
- Evidence checked:
  - `docs/po/current-state.md`
  - test specs under `tests/e2e/**` (present), but no run artifact used as proof in this pack
- Suggested rewrite:
  - "Latest E2E status is informational and should be treated as `LAST_REPORTED`; attach CI/run artifact reference for hard verification."

## 3) Inconsistencies / duplicates in implementation

### A. Two parent entry pages for post-login destination semantics
- Competing files/routes:
  - `src/app/[tenant]/(parent)/parent/page.tsx` -> `/[tenant]/parent`
  - `src/app/[tenant]/(parent)/portal/page.tsx` -> `/[tenant]/portal`
- Which one is linked from nav:
  - `src/components/parent/PortalTopNav.tsx` uses `/[tenant]/portal` as dashboard nav destination.
- Additional routing evidence:
  - `consumeParentMagicLinkToken` redirects to `/[tenant]/parent`.
- Risk:
  - Divergent "home" semantics for parent users (landing vs dashboard).
- Suggested doc deprecation wording:
  - "Parent home currently has two entry routes (`/[tenant]/parent` landing and `/[tenant]/portal` dashboard). Treat `/portal` as canonical nav home; keep `/parent` as transitional auth landing."

### B. Duplicate parent-link create endpoints
- Competing files/routes:
  - `src/app/api/students/[studentId]/parents/route.ts` (`POST` create parent/link)
  - `src/app/api/students/[studentId]/parents/create/route.ts` (`POST` create parent/link)
- Which one is linked from UI:
  - `src/components/admin/students/StudentDetailClient.tsx` calls `/students/${studentId}/parents`.
- Risk:
  - API contract duplication and drift risk.
- Suggested doc deprecation wording:
  - "Use `/api/students/[studentId]/parents` as canonical create/link endpoint; mark `/parents/create` legacy and deprecate after callers are removed."

### C. Dual debug sentry-test routes (alias pattern)
- Competing files/routes:
  - `src/app/api/__debug/sentry-test/route.ts`
  - `src/app/api/debug/sentry-test/route.ts` (re-export wrapper)
- Which one is documented operationally:
  - DevOps docs mention rewrite behavior (`/api/__debug/...` to `/api/debug/...`).
- Risk:
  - Confusion during troubleshooting if docs/env rewrites diverge.
- Suggested doc wording:
  - "Debug Sentry test endpoint is exposed via alias routes; treat `/api/debug/sentry-test` as rewrite target and keep both mappings documented together."

### D. Admin reports nav destination duplicated in group href and item href
- Competing nav entries:
  - `src/lib/nav/adminNavTree.ts` reports group `href: /admin/reports`
  - `src/lib/nav/adminNavTree.ts` reports item `id: "reports"`, `href: /admin/reports`
- Which one is linked from nav:
  - Both are in the same admin nav tree source.
- Risk:
  - Redundant click targets and possible future analytics ambiguity.
- Suggested doc wording:
  - "Reports home route appears both as group href and leaf item by design; if simplified later, keep `/admin/reports` as canonical route."
