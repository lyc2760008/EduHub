# Step 21.3 Reports Staging Gate (Template)

Use this checklist after Step 21.3A + 21.3B are deployed to STAGING.  
Do not mark this gate complete until all P0 criteria pass.

## Environment Header

- STAGING base URL: `<https://...>`
- Commit SHA: `<git-sha>`
- Tenant slug: `<tenant-slug>`
- Tenant path prefix: `/<tenant-slug>` or `/t/<tenant-slug>` (match deployment routing)
- Execution date/time (UTC): `<YYYY-MM-DD HH:mm>`
- Operator: `<name>`

## How To Execute

Use tenant-scoped paths below with the active base URL and tenant prefix:

- Reports home: `<TENANT_PATH_PREFIX>/admin/reports`
- Upcoming sessions: `<TENANT_PATH_PREFIX>/admin/reports/upcoming-sessions`
- Attendance summary: `<TENANT_PATH_PREFIX>/admin/reports/attendance-summary`
- Absence requests: `<TENANT_PATH_PREFIX>/admin/reports/absence-requests`
- Tutor workload: `<TENANT_PATH_PREFIX>/admin/reports/tutor-workload`
- Students directory: `<TENANT_PATH_PREFIX>/admin/reports/students-directory`

API spot-check paths:

- List endpoint: `<TENANT_PATH_PREFIX>/api/admin/reports/{reportId}`
- CSV endpoint: `<TENANT_PATH_PREFIX>/api/admin/reports/{reportId}/export`

## Manual Checklist

Fill every row with `Pass` or `Fail`. Attach evidence links/screenshots.

| Area | Check | Pass/Fail | Notes | Evidence |
|---|---|---|---|---|
| RBAC + tenant isolation | Parent cannot access `/admin/reports` (UI blocked, no partial render) |  |  |  |
| RBAC + tenant isolation | Tutor cannot access `/admin/reports` (UI blocked, no partial render) |  |  |  |
| RBAC + tenant isolation | Parent/tutor cannot read `/api/admin/reports/*` endpoints |  |  |  |
| RBAC + tenant isolation | Admin sees only current tenant data in report tables |  |  |  |
| RBAC + tenant isolation | Admin CSV export contains only current tenant data |  |  |  |
| Report correctness spot-check | Upcoming sessions sampled rows/times match known schedule |  |  |  |
| Report correctness spot-check | Attendance summary sampled totals align with source sessions |  |  |  |
| Report correctness spot-check | Absence request queue sampled statuses align with source requests |  |  |  |
| Admin UX toolkit | Search behavior is debounced and results update correctly |  |  |  |
| Admin UX toolkit | Filter state persists in URL and survives refresh |  |  |  |
| Admin UX toolkit | Pagination behavior and total count display are consistent |  |  |  |
| Admin UX toolkit | Sort state persists in URL and survives refresh |  |  |  |
| Admin UX toolkit | CSV export matches current search/filter/sort state |  |  |  |
| Admin UX toolkit | CSV export respects row cap and excludes secrets |  |  |  |

## P0 Criteria

Any failed item below is a release blocker:

1. Cross-tenant data leak in any report page or export file.
2. Parent/tutor can access admin reports UI or admin reports APIs.
3. Export payload includes secrets or sensitive auth fields (`accessCode`, `token`, `cookie`, `password`, reset secrets).

## QA Handoff Notes

- Blocking issues (P0/P1): `<issue-id + repro>`
- Non-blocking issues: `<issue-id + repro>`
- Final gate decision: `<GO / NO-GO>`
