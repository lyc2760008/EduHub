# Step 21.3A Reporting APIs

## Overview
- Scope: read-only admin reporting APIs with reusable query parsing and CSV export.
- RBAC: `Owner`/`Admin` only (server-side via `requireRole`).
- Tenant isolation: every query includes `tenantId` in report config `where` builders.
- Error contract: stable locale-safe error codes (`INVALID_QUERY`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`).

## Endpoints
- `GET /api/admin/reports/{reportId}`
- `GET /api/admin/reports/{reportId}/export`

Both endpoints run through shared report config allowlists (filters, sort fields, limits).

## Query Params
- `page`: number, default `1`
- `pageSize`: number, default `25`
- `search`: string, optional
- `sortField`: string, optional
- `sortDir`: `asc|desc`, optional
- `filters`: JSON string (strict object, unknown keys rejected)

Example:
`/api/admin/reports/students?page=1&pageSize=25&sortField=name&sortDir=asc&filters={"status":"ACTIVE"}`

## Limits
- Max `pageSize`: `100`
- Max export rows: `5000`
- Max `search` length: `120`

If export matches more than `5000` rows, export is truncated to the cap and audit metadata records that truncation flag.

## Implemented reportIds

### `students`
- Filters: `status` (`ACTIVE|INACTIVE|ALL`), `levelId`, `hasParents`
- Sort fields: `name`, `status`, `createdAt`
- Columns:
  - `id`
  - `name`
  - `status`
  - `levelName`
  - `parentCount`
  - `createdAt`

### `sessions`
- Filters: `from`, `to`, `tutorId`, `groupId`, `centerId`, `sessionType`
- Sort fields: `startAt`, `endAt`, `createdAt`
- Columns:
  - `id`
  - `startAt`
  - `endAt`
  - `sessionType`
  - `centerName`
  - `tutorName`
  - `groupName`
  - `programName`
  - `rosterCount`

### `attendance`
- Filters: `from`, `to`, `studentId`, `tutorId`, `groupId`, `status` (`PRESENT|ABSENT|LATE|EXCUSED|ALL`)
- Sort fields: `markedAt`, `status`, `sessionStartAt`
- Columns:
  - `id`
  - `status`
  - `markedAt`
  - `studentName`
  - `sessionStartAt`
  - `sessionType`
  - `tutorName`
  - `groupName`

### `requests`
- Filters: `from`, `to`, `studentId`, `tutorId`, `status` (`PENDING|APPROVED|DECLINED|WITHDRAWN|ALL`)
- Sort fields: `createdAt`, `updatedAt`, `status`
- Columns:
  - `id`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `studentName`
  - `parentEmail`
  - `sessionStartAt`
  - `tutorName`

## Export behavior
- Export endpoint reuses the same parsed query (search + filters + sorting) as JSON list endpoint.
- Export writes `REPORT_EXPORTED` audit event with safe metadata only:
  - `reportId`
  - `filterKeys`
  - `sortField`
  - `sortDir`
  - `rowCount`
  - `totalCount`
  - `exportTruncated`
  - `searchProvided`

Raw filter values and raw search text are intentionally not stored in audit metadata.

## Performance notes
- Pagination is `count + findMany(skip/take)` per report.
- Existing schema indexes already cover tenant/date/status-heavy access patterns used by these reports.
- No new DB indexes were added in this step.

## UI integration notes
- UI search should be debounced client-side.
- CSV export should pass the same query params used by the list endpoint.
