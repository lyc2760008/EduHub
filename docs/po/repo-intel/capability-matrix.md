# Capability Matrix

Generated from `docs/po/repo-intel/.scan.json` with deterministic ordering.

## 1) Routes (sorted lexicographically)

| Route | Area | Capabilities | Evidence |
| --- | --- | --- | --- |
| `/` | shared | - view:list home (inferred: entity inferred from route segment) | path: `src/app/page.tsx`<br>symbol: `Home`<br>source: `@state.capabilities` |
| `/[tenant]/admin` | admin | - view:list admin_dashboard (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/page.tsx`<br>symbol: `AdminPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/audit` | admin | - view:list audit (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/audit/page.tsx`<br>symbol: `AuditLogPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/catalog` | admin | - view:list catalog (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/catalog/page.tsx`<br>symbol: `CatalogHubPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/centers` | admin | - view:list centers (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/centers/page.tsx`<br>symbol: `CentersPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/groups` | admin | - view:list groups (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/groups/page.tsx`<br>symbol: `GroupsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/groups/[id]` | admin | - view:detail groups (inferred: entity inferred from dynamic route segment) | path: `src/app/[tenant]/(admin)/admin/groups/[id]/page.tsx`<br>symbol: `GroupDetailPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/help` | admin | - view:list help (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/help/page.tsx`<br>symbol: `AdminHelpPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/levels` | admin | - view:list levels (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/levels/page.tsx`<br>symbol: `LevelsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/parents` | admin | - view:list parents (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/parents/page.tsx`<br>symbol: `ParentsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/programs` | admin | - view:list programs (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/programs/page.tsx`<br>symbol: `ProgramsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/reports` | admin | - view:list reports (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/reports/page.tsx`<br>symbol: `ReportsIndexPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/reports/absence-requests` | admin | - view:list absence_requests (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/reports/absence-requests/page.tsx`<br>symbol: `AbsenceRequestsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/reports/attendance-summary` | admin | - view:list attendance_summary (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/reports/attendance-summary/page.tsx`<br>symbol: `AttendanceSummaryPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/reports/students-directory` | admin | - view:list students_directory (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/reports/students-directory/page.tsx`<br>symbol: `StudentsDirectoryPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/reports/tutor-workload` | admin | - view:list tutor_workload (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/reports/tutor-workload/page.tsx`<br>symbol: `TutorWorkloadPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/reports/upcoming-sessions` | admin | - view:list upcoming_sessions (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/reports/upcoming-sessions/page.tsx`<br>symbol: `UpcomingSessionsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/requests` | admin | - view:list requests (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/requests/page.tsx`<br>symbol: `RequestsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/sessions` | admin | - view:list sessions (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/sessions/page.tsx`<br>symbol: `SessionsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/sessions/[id]` | admin | - view:detail sessions (inferred: entity inferred from dynamic route segment)<br>- report_absence:create_request | path: `src/app/[tenant]/(admin)/admin/sessions/[id]/page.tsx`<br>symbol: `SessionDetailPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/students` | admin | - view:list students (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/students/page.tsx`<br>symbol: `StudentsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/students/[id]` | admin | - view:detail students (inferred: entity inferred from dynamic route segment)<br>- parent_invite:send_signin_link | path: `src/app/[tenant]/(admin)/admin/students/[id]/page.tsx`<br>symbol: `StudentDetailPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/subjects` | admin | - view:list subjects (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/subjects/page.tsx`<br>symbol: `SubjectsPage`<br>source: `@state.capabilities` |
| `/[tenant]/admin/users` | admin | - view:list users (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(admin)/admin/users/page.tsx`<br>symbol: `UsersPage`<br>source: `@state.capabilities` |
| `/[tenant]/api/parent-auth/magic-link/consume` | parent | - view:list consume (inferred: entity inferred from route segment) | path: `src/app/[tenant]/api/parent-auth/magic-link/consume/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/[tenant]/api/parent-auth/magic-link/request` | parent | - create request | path: `src/app/[tenant]/api/parent-auth/magic-link/request/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/[tenant]/login` | shared | - view:list staff_login (inferred: entity inferred from route segment) | path: `src/app/[tenant]/login/page.tsx`<br>symbol: `LoginPage`<br>source: `@state.capabilities` |
| `/[tenant]/parent` | parent | - view:list parent_landing (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent)/parent/page.tsx`<br>symbol: `ParentLandingPage`<br>source: `@state.capabilities` |
| `/[tenant]/parent/auth/verify` | parent | - view:list magic_link_verification (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent-auth)/parent/auth/verify/page.tsx`<br>symbol: `ParentVerifyPage`<br>source: `@state.capabilities` |
| `/[tenant]/parent/login` | parent | - view:list parent_login (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent-auth)/parent/login/page.tsx`<br>symbol: `ParentLoginPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal` | parent | - view:list portal_dashboard (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent)/portal/page.tsx`<br>symbol: `PortalDashboardPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/account` | parent | - view:list account (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent)/portal/account/page.tsx`<br>symbol: `PortalAccountPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/help` | parent | - view:list help (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent)/portal/help/page.tsx`<br>symbol: `PortalHelpPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/requests` | parent | - view:list requests (inferred: entity inferred from route segment)<br>- report_absence:create_request<br>- request:withdraw | path: `src/app/[tenant]/(parent)/portal/requests/page.tsx`<br>symbol: `PortalRequestsPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/sessions` | parent | - view:list sessions (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent)/portal/sessions/page.tsx`<br>symbol: `PortalSessionsPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/sessions/[id]` | parent | - view:detail sessions (inferred: entity inferred from dynamic route segment)<br>- report_absence:create_request<br>- request:withdraw<br>- request:resubmit | path: `src/app/[tenant]/(parent)/portal/sessions/[id]/page.tsx`<br>symbol: `PortalSessionDetailPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/students` | parent | - view:list students (inferred: entity inferred from route segment) | path: `src/app/[tenant]/(parent)/portal/students/page.tsx`<br>symbol: `PortalStudentsPage`<br>source: `@state.capabilities` |
| `/[tenant]/portal/students/[id]` | parent | - view:detail students (inferred: entity inferred from dynamic route segment) | path: `src/app/[tenant]/(parent)/portal/students/[id]/page.tsx`<br>symbol: `PortalStudentDetailPage`<br>source: `@state.capabilities` |
| `/api/__debug/sentry-test` | shared | - view:list sentry_test (inferred: entity inferred from route segment) | path: `src/app/api/__debug/sentry-test/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/audit` | admin | - view:list audit (inferred: entity inferred from route segment) | path: `src/app/api/admin/audit/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/audit/[id]` | admin | - view:detail audit (inferred: entity inferred from dynamic route segment) | path: `src/app/api/admin/audit/[id]/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/[reportId]` | admin | - view:detail reports (inferred: entity inferred from dynamic route segment) | path: `src/app/api/admin/reports/[reportId]/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/[reportId]/export` | admin | - view:detail export (inferred: entity inferred from dynamic route segment) | path: `src/app/api/admin/reports/[reportId]/export/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/absence-requests` | admin | - view:list absence_requests (inferred: entity inferred from route segment) | path: `src/app/api/admin/reports/absence-requests/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/attendance-summary` | admin | - view:list attendance_summary (inferred: entity inferred from route segment) | path: `src/app/api/admin/reports/attendance-summary/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/students-directory` | admin | - view:list students_directory (inferred: entity inferred from route segment) | path: `src/app/api/admin/reports/students-directory/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/tutor-workload` | admin | - view:list tutor_workload (inferred: entity inferred from route segment) | path: `src/app/api/admin/reports/tutor-workload/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/reports/upcoming-sessions` | admin | - view:list upcoming_sessions (inferred: entity inferred from route segment) | path: `src/app/api/admin/reports/upcoming-sessions/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/admin/students/[id]/invite-copied` | admin | - create invite copied | path: `src/app/api/admin/students/[id]/invite-copied/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/admin/students/[id]/invite-data` | admin | - view:detail invite_data (inferred: entity inferred from dynamic route segment) | path: `src/app/api/admin/students/[id]/invite-data/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/attendance/suggestion` | shared | - view:list suggestion (inferred: entity inferred from route segment)<br>- report_absence:create_request | path: `src/app/api/attendance/suggestion/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/auth/[...nextauth]` | shared | - view:detail auth_session (inferred: exported GET handler in NextAuth route)<br>- create auth_session (inferred: exported POST handler in NextAuth route) | path: `src/app/api/auth/[...nextauth]/route.ts`<br>symbol: `re-exported handlers`<br>source: handler/route inference |
| `/api/centers` | shared | - view:list centers (inferred: entity inferred from route segment)<br>- create center | path: `src/app/api/centers/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/centers/[id]` | shared | - view:detail centers (inferred: entity inferred from dynamic route segment)<br>- update center | path: `src/app/api/centers/[id]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/debug/sentry-test` | shared | - view:list sentry_test (inferred: GET re-export from /api/__debug/sentry-test) | path: `src/app/api/debug/sentry-test/route.ts`<br>symbol: `re-exported handlers`<br>source: handler/route inference |
| `/api/groups` | shared | - view:list groups (inferred: entity inferred from route segment)<br>- create group | path: `src/app/api/groups/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/groups/[id]` | shared | - view:detail groups (inferred: entity inferred from dynamic route segment)<br>- update group | path: `src/app/api/groups/[id]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/groups/[id]/students` | shared | - update student | path: `src/app/api/groups/[id]/students/route.ts`<br>symbol: `PUT`<br>source: `@state.capabilities` |
| `/api/groups/[id]/sync-future-sessions` | shared | - create sync future session | path: `src/app/api/groups/[id]/sync-future-sessions/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/groups/[id]/tutors` | shared | - update tutor | path: `src/app/api/groups/[id]/tutors/route.ts`<br>symbol: `PUT`<br>source: `@state.capabilities` |
| `/api/health` | shared | - view:list health (inferred: entity inferred from route segment) | path: `src/app/api/health/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/levels` | shared | - view:list levels (inferred: entity inferred from route segment)<br>- create level | path: `src/app/api/levels/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/levels/[id]` | shared | - view:detail levels (inferred: entity inferred from dynamic route segment)<br>- update level | path: `src/app/api/levels/[id]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/me` | shared | - view:list me (inferred: entity inferred from route segment) | path: `src/app/api/me/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/parents` | parent | - view:list parents (inferred: entity inferred from route segment)<br>- create parent | path: `src/app/api/parents/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/parents/[parentId]` | parent | - view:detail parents (inferred: entity inferred from dynamic route segment)<br>- update parent | path: `src/app/api/parents/[parentId]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/parents/[parentId]/send-magic-link` | parent | - create send magic link<br>- parent_invite:send_signin_link | path: `src/app/api/parents/[parentId]/send-magic-link/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/portal/attendance` | parent | - view:list attendance (inferred: entity inferred from route segment) | path: `src/app/api/portal/attendance/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/portal/me` | parent | - view:list me (inferred: entity inferred from route segment) | path: `src/app/api/portal/me/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/portal/onboarding/dismiss` | parent | - onboarding:dismiss_welcome (inferred: annotation token is non-domain; normalized from route + parent.hasSeenWelcome update) | path: `src/app/api/portal/onboarding/dismiss/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/portal/requests` | parent | - view:list requests (inferred: entity inferred from route segment)<br>- create request<br>- report_absence:create_request | path: `src/app/api/portal/requests/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/portal/requests/[id]/resubmit` | parent | - create resubmit<br>- request:resubmit | path: `src/app/api/portal/requests/[id]/resubmit/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/portal/requests/[id]/withdraw` | parent | - create withdraw<br>- request:withdraw | path: `src/app/api/portal/requests/[id]/withdraw/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/portal/sessions` | parent | - view:list sessions (inferred: entity inferred from route segment) | path: `src/app/api/portal/sessions/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/portal/sessions/[id]` | parent | - view:detail sessions (inferred: entity inferred from dynamic route segment) | path: `src/app/api/portal/sessions/[id]/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/portal/students` | parent | - view:list students (inferred: entity inferred from route segment) | path: `src/app/api/portal/students/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/portal/students/[id]` | parent | - view:detail students (inferred: entity inferred from dynamic route segment) | path: `src/app/api/portal/students/[id]/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/programs` | shared | - view:list programs (inferred: entity inferred from route segment)<br>- create program | path: `src/app/api/programs/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/programs/[id]` | shared | - view:detail programs (inferred: entity inferred from dynamic route segment)<br>- update program | path: `src/app/api/programs/[id]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/reports/student-activity` | shared | - view:list student_activity (inferred: entity inferred from route segment) | path: `src/app/api/reports/student-activity/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/reports/upcoming-sessions` | shared | - view:list upcoming_sessions (inferred: entity inferred from route segment) | path: `src/app/api/reports/upcoming-sessions/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/reports/weekly-attendance` | shared | - view:list weekly_attendance (inferred: entity inferred from route segment) | path: `src/app/api/reports/weekly-attendance/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/requests` | shared | - view:list requests (inferred: entity inferred from route segment)<br>- request:withdraw<br>- request:resubmit | path: `src/app/api/requests/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/requests/[id]/resolve` | shared | - create resolve | path: `src/app/api/requests/[id]/resolve/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/sessions` | shared | - view:list sessions (inferred: entity inferred from route segment)<br>- create session<br>- report_absence:create_request | path: `src/app/api/sessions/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/sessions/[id]` | shared | - view:detail sessions (inferred: entity inferred from dynamic route segment) | path: `src/app/api/sessions/[id]/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/sessions/[id]/attendance` | shared | - view:detail attendance (inferred: entity inferred from dynamic route segment)<br>- update attendance<br>- report_absence:create_request | path: `src/app/api/sessions/[id]/attendance/route.ts`<br>symbol: `GET, PUT`<br>source: `@state.capabilities` |
| `/api/sessions/[id]/notes` | shared | - view:detail notes (inferred: entity inferred from dynamic route segment)<br>- update note | path: `src/app/api/sessions/[id]/notes/route.ts`<br>symbol: `GET, PUT`<br>source: `@state.capabilities` |
| `/api/sessions/generate` | shared | - create generate | path: `src/app/api/sessions/generate/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/students` | shared | - view:list students (inferred: entity inferred from route segment)<br>- create student | path: `src/app/api/students/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/students/[studentId]` | shared | - view:detail students (inferred: entity inferred from dynamic route segment)<br>- update student | path: `src/app/api/students/[studentId]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/students/[studentId]/parents` | parent | - view:detail parents (inferred: entity inferred from dynamic route segment)<br>- create parent | path: `src/app/api/students/[studentId]/parents/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/students/[studentId]/parents/[parentId]` | parent | - delete parent | path: `src/app/api/students/[studentId]/parents/[parentId]/route.ts`<br>symbol: `DELETE`<br>source: `@state.capabilities` |
| `/api/students/[studentId]/parents/create` | parent | - create create (inferred: annotation entity is placeholder; normalized from route) | path: `src/app/api/students/[studentId]/parents/create/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/subjects` | shared | - view:list subjects (inferred: entity inferred from route segment)<br>- create subject | path: `src/app/api/subjects/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/subjects/[id]` | shared | - view:detail subjects (inferred: entity inferred from dynamic route segment)<br>- update subject | path: `src/app/api/subjects/[id]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |
| `/api/tenant` | shared | - view:list tenant (inferred: entity inferred from route segment) | path: `src/app/api/tenant/route.ts`<br>symbol: `GET`<br>source: `@state.capabilities` |
| `/api/test/mint-parent-magic-link` | shared | - create mint parent magic link | path: `src/app/api/test/mint-parent-magic-link/route.ts`<br>symbol: `POST`<br>source: `@state.capabilities` |
| `/api/users` | shared | - view:list users (inferred: entity inferred from route segment)<br>- create user | path: `src/app/api/users/route.ts`<br>symbol: `GET, POST`<br>source: `@state.capabilities` |
| `/api/users/[id]` | shared | - view:detail users (inferred: entity inferred from dynamic route segment)<br>- update user | path: `src/app/api/users/[id]/route.ts`<br>symbol: `GET, PATCH`<br>source: `@state.capabilities` |

## 2) Data mutations (sorted by model/table)

### attendance
- create (raw: `createMany`)
- Evidence: `prisma/seed.ts:1326`, symbol `module-scope`
- Trigger: pnpm db:seed
- upsert (raw: `upsert`)
- Evidence: `src/app/api/sessions/[id]/attendance/route.ts:427`, symbol `module-scope`
- Trigger: /api/sessions/[id]/attendance
- delete (raw: `deleteMany`)
- Evidence: `src/app/api/sessions/[id]/attendance/route.ts:468`, symbol `module-scope`
- Trigger: /api/sessions/[id]/attendance

### auditEvent
- create (raw: `create`)
- Evidence: `src/lib/audit/writeAuditEvent.ts:113`, symbol `writeAuditEvent`
- Trigger: Shared helper invoked by multiple request/attendance/invite endpoints

### center
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:130`, symbol `upsertCenter`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `src/app/api/centers/[id]/route.ts:119`, symbol `PATCH`
- Trigger: /api/centers/[id]
- create (raw: `create`)
- Evidence: `src/app/api/centers/route.ts:97`, symbol `POST`
- Trigger: /api/centers

### group
- update (raw: `update`)
- Evidence: `prisma/seed.ts:330`, symbol `upsertGroup`
- Trigger: pnpm db:seed
- create (raw: `create`)
- Evidence: `prisma/seed.ts:344`, symbol `upsertGroup`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `src/app/api/groups/[id]/route.ts:174`, symbol `PATCH`
- Trigger: /api/groups/[id]
- create (raw: `create`)
- Evidence: `src/app/api/groups/route.ts:308`, symbol `POST`
- Trigger: /api/groups

### groupStudent
- create (raw: `createMany`)
- Evidence: `prisma/seed.ts:1138`, symbol `module-scope`
- Trigger: pnpm db:seed
- create (raw: `createMany`)
- Evidence: `src/app/api/groups/route.ts:347`, symbol `module-scope`
- Trigger: /api/groups

### groupTutor
- create (raw: `createMany`)
- Evidence: `prisma/seed.ts:831`, symbol `module-scope`
- Trigger: pnpm db:seed
- create (raw: `createMany`)
- Evidence: `src/app/api/groups/route.ts:336`, symbol `module-scope`
- Trigger: /api/groups

### level
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:181`, symbol `upsertLevel`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `src/app/api/levels/[id]/route.ts:105`, symbol `PATCH`
- Trigger: /api/levels/[id]
- create (raw: `create`)
- Evidence: `src/app/api/levels/route.ts:180`, symbol `POST`
- Trigger: /api/levels

### parent
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:240`, symbol `upsertParent`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `src/app/api/parents/[parentId]/route.ts:89`, symbol `PATCH`
- Trigger: /api/parents/[parentId]
- create (raw: `create`)
- Evidence: `src/app/api/parents/route.ts:197`, symbol `POST`
- Trigger: /api/parents
- update (raw: `updateMany`)
- Evidence: `src/app/api/portal/onboarding/dismiss/route.ts:43`, symbol `POST`
- Trigger: /api/portal/onboarding/dismiss
- create (raw: `create`)
- Evidence: `src/app/api/students/[studentId]/parents/create/route.ts:72`, symbol `POST`
- Trigger: /api/students/[studentId]/parents/create
- create (raw: `create`)
- Evidence: `src/app/api/students/[studentId]/parents/route.ts:145`, symbol `POST`
- Trigger: /api/students/[studentId]/parents

### parentMagicLinkToken
- create (raw: `create`)
- Evidence: `src/app/api/test/mint-parent-magic-link/route.ts:120`, symbol `POST`
- Trigger: /api/test/mint-parent-magic-link
- update (raw: `update`)
- Evidence: `src/lib/auth/options.ts:187`, symbol `module-scope`
- Trigger: /api/auth/[...nextauth] parent-magic-link authorize flow
- create (raw: `create`)
- Evidence: `src/lib/auth/parentMagicLink.ts:143`, symbol `sendParentMagicLink`
- Trigger: /api/parents/[parentId]/send-magic-link (POST) + /[tenant]/api/parent-auth/magic-link/request (POST) via sendParentMagicLink

### parentRequest
- update (raw: `updateMany`)
- Evidence: `src/app/api/portal/requests/[id]/resubmit/route.ts:99`, symbol `POST`
- Trigger: /api/portal/requests/[id]/resubmit
- update (raw: `updateMany`)
- Evidence: `src/app/api/portal/requests/[id]/withdraw/route.ts:100`, symbol `POST`
- Trigger: /api/portal/requests/[id]/withdraw
- create (raw: `create`)
- Evidence: `src/app/api/portal/requests/route.ts:165`, symbol `POST`
- Trigger: /api/portal/requests
- update (raw: `updateMany`)
- Evidence: `src/app/api/requests/[id]/resolve/route.ts:126`, symbol `POST`
- Trigger: /api/requests/[id]/resolve

### program
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:209`, symbol `upsertProgram`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `src/app/api/programs/[id]/route.ts:133`, symbol `PATCH`
- Trigger: /api/programs/[id]
- create (raw: `create`)
- Evidence: `src/app/api/programs/route.ts:209`, symbol `POST`
- Trigger: /api/programs

### session
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:370`, symbol `upsertSession`
- Trigger: pnpm db:seed
- create (raw: `createMany`)
- Evidence: `scripts/pilot/mmc-setup.ts:1127`, symbol `module-scope`
- Trigger: pnpm pilot:mmc:staging | pnpm pilot:mmc:prod
- create (raw: `create`)
- Evidence: `src/app/api/sessions/generate/route.ts:302`, symbol `module-scope`
- Trigger: /api/sessions/generate
- create (raw: `create`)
- Evidence: `src/app/api/sessions/route.ts:408`, symbol `module-scope`
- Trigger: /api/sessions

### sessionNote
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:408`, symbol `upsertSessionNote`
- Trigger: pnpm db:seed
- upsert (raw: `upsert`)
- Evidence: `src/app/api/sessions/[id]/notes/route.ts:204`, symbol `PUT`
- Trigger: /api/sessions/[id]/notes

### sessionStudent
- create (raw: `createMany`)
- Evidence: `prisma/seed.ts:1301`, symbol `module-scope`
- Trigger: pnpm db:seed
- create (raw: `createMany`)
- Evidence: `src/app/api/groups/[id]/sync-future-sessions/route.ts:97`, symbol `POST`
- Trigger: /api/groups/[id]/sync-future-sessions
- create (raw: `createMany`)
- Evidence: `src/app/api/sessions/[id]/attendance/route.ts:414`, symbol `module-scope`
- Trigger: /api/sessions/[id]/attendance
- create (raw: `createMany`)
- Evidence: `src/app/api/sessions/generate/route.ts:322`, symbol `module-scope`
- Trigger: /api/sessions/generate
- create (raw: `createMany`)
- Evidence: `src/app/api/sessions/route.ts:447`, symbol `module-scope`
- Trigger: /api/sessions

### staffCenter
- create (raw: `createMany`)
- Evidence: `prisma/seed.ts:822`, symbol `module-scope`
- Trigger: pnpm db:seed

### student
- update (raw: `update`)
- Evidence: `prisma/seed.ts:285`, symbol `upsertStudent`
- Trigger: pnpm db:seed
- create (raw: `create`)
- Evidence: `prisma/seed.ts:298`, symbol `upsertStudent`
- Trigger: pnpm db:seed
- update (raw: `updateMany`)
- Evidence: `src/app/api/students/[studentId]/route.ts:119`, symbol `PATCH`
- Trigger: /api/students/[studentId]
- create (raw: `create`)
- Evidence: `src/app/api/students/route.ts:235`, symbol `POST`
- Trigger: /api/students

### studentParent
- create (raw: `createMany`)
- Evidence: `prisma/seed.ts:1118`, symbol `module-scope`
- Trigger: pnpm db:seed
- delete (raw: `deleteMany`)
- Evidence: `src/app/api/students/[studentId]/parents/[parentId]/route.ts:46`, symbol `DELETE`
- Trigger: /api/students/[studentId]/parents/[parentId]
- create (raw: `create`)
- Evidence: `src/app/api/students/[studentId]/parents/create/route.ts:84`, symbol `POST`
- Trigger: /api/students/[studentId]/parents/create
- create (raw: `create`)
- Evidence: `src/app/api/students/[studentId]/parents/route.ts:170`, symbol `POST`
- Trigger: /api/students/[studentId]/parents

### subject
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:156`, symbol `upsertSubject`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `src/app/api/subjects/[id]/route.ts:104`, symbol `PATCH`
- Trigger: /api/subjects/[id]
- create (raw: `create`)
- Evidence: `src/app/api/subjects/route.ts:174`, symbol `POST`
- Trigger: /api/subjects

### tenant
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:74`, symbol `upsertTenant`
- Trigger: pnpm db:seed
- create (raw: `create`)
- Evidence: `scripts/provision-tenant.ts:188`, symbol `module-scope`
- Trigger: pnpm provision:tenant

### tenantMembership
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:519`, symbol `module-scope`
- Trigger: pnpm db:seed
- create (raw: `create`)
- Evidence: `scripts/provision-tenant.ts:224`, symbol `module-scope`
- Trigger: pnpm provision:tenant
- update (raw: `update`)
- Evidence: `src/app/api/users/[id]/route.ts:164`, symbol `module-scope`
- Trigger: /api/users/[id]
- upsert (raw: `upsert`)
- Evidence: `src/app/api/users/route.ts:283`, symbol `module-scope`
- Trigger: /api/users

### user
- upsert (raw: `upsert`)
- Evidence: `prisma/seed.ts:109`, symbol `upsertUser`
- Trigger: pnpm db:seed
- update (raw: `update`)
- Evidence: `scripts/admin/reset-user-password.ts:192`, symbol `main`
- Trigger: manual admin password reset script
- create (raw: `create`)
- Evidence: `scripts/provision-tenant.ts:215`, symbol `module-scope`
- Trigger: pnpm provision:tenant
- update (raw: `update`)
- Evidence: `src/app/api/users/[id]/route.ts:156`, symbol `PATCH`
- Trigger: /api/users/[id]
- update (raw: `update`)
- Evidence: `src/app/api/users/route.ts:246`, symbol `POST`
- Trigger: /api/users
- create (raw: `create`)
- Evidence: `src/app/api/users/route.ts:255`, symbol `POST`
- Trigger: /api/users

## 3) Access control summary

Primary auth/RBAC/tenant guard helpers:
- `src/lib/tenant/resolveTenant.ts` ? `resolveTenant` (tenant resolution from host/path/headers).
- `src/lib/rbac/index.ts` ? `requireAuth`, `requireTenantMembership`, `requireRole` (API/server RBAC guards).
- `src/lib/rbac/page.ts` ? `requirePageRole` (server-page wrapper around `requireRole`).
- `src/lib/rbac/parent.ts` ? `requireParentAccess` (parent layout gate + tenant match).
- `src/lib/portal/parent.ts` ? `requirePortalParent`, `assertParentLinkedToStudent`, `assertSessionUpcomingAndMatchesStudent` (parent API scoping).
- `src/components/admin/shared/AdminAccessGate.tsx` ? page-level guard UI/redirect behavior for admin pages.

Admin scoping and enforcement:
- Layout-level guard in `src/app/[tenant]/(admin)/layout.tsx` uses `AdminAccessGate` with roles `Owner|Admin|Tutor`; page-level routes narrow to admin-only where required.
- Admin API routes call `requireRole(req, ADMIN_ROLES)` and scope reads/writes by `tenantId` in Prisma where clauses (e.g., `src/app/api/centers/route.ts`, `src/app/api/requests/[id]/resolve/route.ts`).

Tutor scoping and enforcement:
- No dedicated `/tutor` route tree; tutor access is enforced on shared operations APIs using `READ_ROLES` that include `Tutor` (e.g., `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/attendance/route.ts`, `src/app/api/sessions/[id]/notes/route.ts`).
- Tutor visibility is narrowed by ownership filters (`tutorId = ctx.user.id`) on session/attendance APIs.

Parent scoping and enforcement:
- Portal layouts (`src/app/[tenant]/(parent)/portal/layout.tsx`, `src/app/[tenant]/(parent)/parent/layout.tsx`) enforce `requireParentAccess` before rendering.
- Parent APIs call `requirePortalParent(req)` then enforce linkage/session ownership checks with `assertParentLinkedToStudent` and `assertSessionUpcomingAndMatchesStudent` in `src/lib/portal/parent.ts`.
