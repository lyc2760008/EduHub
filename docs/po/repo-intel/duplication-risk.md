# Duplication Risk Report

Basis used:
- Code reality: `docs/po/repo-intel/capability-matrix.md` + route/mutation evidence in `src/app/**`, `src/lib/**`.
- Prior PO doc signals in scope: `docs/po/**` (this repo currently contains `docs/po/current-state.md` and `docs/po/current-state.generated.md`).

Note: `docs/po/**` currently has no future Step 20.x/21.x/22.x proposal docs beyond already-implemented Step 22.2 references in `current-state.md`, so duplicate-risk evidence is primarily "already shipped" themes.

## 1) High-risk duplicate areas

### A. Proposed theme: "Parent invite/resend v1 completion"
- Prior-doc signal:
  - Step 22.2 is already recorded in `docs/po/current-state.md` (admin invite/resend from student detail).
- Already exists in code:
  - UI action in `src/components/admin/students/StudentDetailClient.tsx` (`handleSendMagicLink`)
  - Endpoint `POST /api/parents/[parentId]/send-magic-link` in `src/app/api/parents/[parentId]/send-magic-link/route.ts`
  - Shared issuer `sendParentMagicLink` in `src/lib/auth/parentMagicLink.ts`
- Safe deltas only:
  - Delivery hardening (metrics, rate-limit tuning, copy/UX polish), not net-new invite/resend capability.

### B. Proposed theme: "Parent dashboard read-only initial release"
- Prior-doc signal:
  - Parent portal home/sessions/requests/students are listed as implemented in `docs/po/current-state.md`.
- Already exists in code:
  - `/[tenant]/portal` dashboard in `src/app/[tenant]/(parent)/portal/page.tsx`
  - `/api/portal/me`, `/api/portal/students`, `/api/portal/sessions`, `/api/portal/attendance`
- Safe deltas only:
  - Narrow improvements to data quality/perf/error handling; avoid re-scoping dashboard as a new feature pack.

### C. Proposed theme: "Parent requests workflow v1"
- Prior-doc signal:
  - Current-state route inventory already lists request create/withdraw/resubmit behavior.
- Already exists in code:
  - Parent create/withdraw/resubmit: `/api/portal/requests`, `/api/portal/requests/[id]/withdraw`, `/api/portal/requests/[id]/resubmit`
  - Admin resolve: `/api/requests/[id]/resolve`
  - Admin list: `/api/requests` + `/[tenant]/admin/requests`
- Safe deltas only:
  - Additional statuses/analytics/audit refinements, not re-implementing lifecycle endpoints.

### D. Proposed theme: "Reports hub pack"
- Prior-doc signal:
  - Reports hub + report pages are listed in `docs/po/current-state.md`.
- Already exists in code:
  - Admin report pages under `/[tenant]/admin/reports/**`
  - Admin report APIs under `/api/admin/reports/**` including export handler
- Safe deltas only:
  - New report dimensions/filters/export formats; avoid duplicating existing report shells/routes.

### E. Proposed theme: "Catalog CRUD baseline"
- Prior-doc signal:
  - Catalog/setup routes are listed in `docs/po/current-state.md`.
- Already exists in code:
  - Centers/groups/programs/subjects/levels API CRUD routes under `/api/{centers|groups|programs|subjects|levels}`
  - Admin pages under `/[tenant]/admin/{centers|groups|programs|subjects|levels}`
- Safe deltas only:
  - Validation/constraints/table UX enhancements; avoid creating parallel CRUD routes/components.

## 2) Safe next-step zones

### A. Unknown capability annotations (low duplicate risk, high clarity value)
- Evidence:
  - `src/app/api/auth/[...nextauth]/route.ts` has `@state.capabilities UNKNOWN`.
  - `src/app/api/debug/sentry-test/route.ts` has `@state.capabilities UNKNOWN`.
- Why safe:
  - This is documentation/annotation debt; clarifying capability tags is non-duplicative.

### B. Capability annotation quality fixes (`create:dismis`, `create:create`)
- Evidence:
  - `src/app/api/portal/onboarding/dismiss/route.ts` (`@state.capabilities create:dismis` typo-like token)
  - `src/app/api/students/[studentId]/parents/create/route.ts` (`@state.capabilities create:create` placeholder token)
- Why safe:
  - Normalizing capability labels/documentation avoids planning confusion without changing behavior.

### C. Duplicate API endpoint cleanup (`/parents` vs `/parents/create`)
- Evidence:
  - Both endpoints implement parent-link creation.
  - Active UI caller uses `/api/students/[studentId]/parents` (`StudentDetailClient`).
- Why safe:
  - Deprecation/consolidation is unlikely to duplicate user-facing features; it reduces maintenance risk.

### D. Parent home route canonicalization (`/parent` vs `/portal`)
- Evidence:
  - `/[tenant]/parent` and `/[tenant]/portal` both exist.
  - Nav points to `/portal`; magic-link consume redirect targets `/parent`.
- Why safe:
  - Aligning canonical route semantics is a stabilization task, not a net-new feature.

### E. Current-state governance TODOs
- Evidence:
  - `docs/po/current-state.md` has unresolved owner names and TODO step IDs.
  - `docs/po/current-state.md` has Known Gaps/Planned Next TODO placeholders.
- Why safe:
  - Filling governance/documentation gaps prevents duplicate planning without changing product behavior.
