# Step 20.9 — UX Release Checklist
Date: 2026-02-05 (America/Edmonton)

**Checklist**
1. Parent login (`/[tenant]/parent/login`) shows friendly invalid-credentials copy and does not reveal whether an email exists; banner uses `role="alert"` and is readable on 320px.
2. Throttle state shows a warning banner and surfaces "Try again in {minutes} minutes" when provided; lockout state disables submit and shows fallback copy when time is missing.
3. Language toggle in the portal header keeps the current page and does not reset filters (Sessions range/student filter, Requests status filter); no logout occurs.
4. Portal header identity chip is visible at 320px with safe email truncation; menu includes Account, Help, and Log out with tappable targets.
5. Logout is reachable from the header dropdown and the mobile menu sheet.
6. Dashboard (`/[tenant]/portal`) renders correctly with 0 students (empty state) and with linked students (cards/metrics visible).
7. Students list (`/[tenant]/portal/students`) shows linked students; no-students empty state provides a clear next step (contact center admin).
8. Student detail (`/[tenant]/portal/students/[id]`) loads overview + attendance tabs and maintains a reliable back path.
9. Sessions list (`/[tenant]/portal/sessions`) defaults to upcoming sessions ascending; filters persist across navigation; time hint appears.
10. Session detail (`/[tenant]/portal/sessions/[id]`) shows title/type, date/time + duration, student(s), tutor, and location/center when available.
11. Timezone rule is consistent: timestamps render using per-session timezone when present, otherwise tenant timezone from portal identity; if tenant timezone is missing, fallback to local timezone; time hint reflects single vs multiple zones.
12. Attendance history on student detail is newest-first, uses friendly empty/error states, and links to session detail when applicable.
13. Requests list (`/[tenant]/portal/requests`) shows newest-first and uses consistent status vocabulary: Pending review / Approved / Declined / Withdrawn (EN + zh-CN).
14. Clicking a request row deep-links to the absence request section on Session Detail and scrolls into view.
15. Absence request section on Session Detail shows consistent status badge wording and neutral styling for Withdrawn.
16. Withdraw/resubmit modals clearly state "does not cancel or reschedule"; actions appear only before session start and only for eligible statuses.
17. Help (`/[tenant]/portal/help`) timezone explanation matches the "Times shown in {tz}" hint language.
18. Account (`/[tenant]/portal/account`) renders correctly and remains accessible from the header menu after language toggle.
19. Admin Audit Log (`/[tenant]/admin/audit`) is admin-only, defaults to newest-first, filters work (range/category/actor), and mobile view uses stacked cards with a readable detail drawer.

**Implemented fixes**
- Updated Step 20.9 copy keys (auth throttle/lockout, parent audit labels, pending status label, empty-state guidance) to avoid leaky/technical wording and fill missing zh values. Files: `messages/en.json`, `messages/zh-CN.json`.
- Portal time hint fallback now uses a tenant center timezone instead of hardcoded UTC to prevent misleading hints on empty-state pages. File: `src/app/api/portal/me/route.ts`.
- Requests list sorting now uses submittedAt (createdAt) so newest-first ordering stays consistent with the UX contract even after status updates. File: `src/app/[tenant]/(parent)/portal/requests/page.tsx`.

**Deferred**
- Normalize resubmit hyphenation across portal copy (P2) pending product preference; would touch multiple `portal.absence.*` keys in `messages/en.json` and `messages/zh-CN.json`.

**Repo References**
- i18n dictionaries: `messages/en.json`, `messages/zh-CN.json`, `src/i18n/request.ts`
- Parent login: `src/app/[tenant]/(parent-auth)/parent/login/page.tsx`, `src/app/[tenant]/login/page.tsx`
- Portal shell/header identity: `src/components/parent/ParentShell.tsx`, `src/components/parent/PortalTopNav.tsx`, `src/components/parent/portal/PortalIdentityMenu.tsx`
- Portal requests: `src/app/[tenant]/(parent)/portal/requests/page.tsx`, `src/app/[tenant]/(parent)/portal/sessions/[id]/page.tsx`
- Portal time hint + formatting: `src/components/parent/portal/PortalTimeHint.tsx`, `src/lib/portal/format.ts`
- Admin audit log: `src/app/[tenant]/(admin)/admin/audit/page.tsx`, `src/components/admin/audit/AuditLogClient.tsx`
