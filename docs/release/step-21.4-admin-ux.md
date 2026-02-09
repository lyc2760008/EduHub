# Step 21.4A Admin List Query Contract Standardization

## Overview + RBAC
- Admin list endpoints now reuse the Step 21.3 admin table query contract for consistent search, filters, sorting, and pagination.
- Tenant isolation: every list query includes tenantId in the where clause.
- RBAC: Owner/Admin required for admin list endpoints; sessions list also allows Tutor and scopes tutors to their own sessions.
- Error responses are locale-safe codes only: INVALID_QUERY, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, INTERNAL_ERROR.

## Query Params Contract
- search: string (optional, trimmed)
- page: number (default 1, min 1)
- pageSize: number (default 25, max 100)
- sortField: string (optional; must be allowlisted per endpoint)
- sortDir: asc|desc (optional; defaults per endpoint)
- filters: JSON string (optional; strict object, unknown keys rejected)

Response shape:
{
  rows: T[],
  totalCount: number,
  page: number,
  pageSize: number,
  sort: { field: string | null, dir: "asc" | "desc" },
  appliedFilters: Record<string, unknown>
}

## Global Limits
- max pageSize: 100
- max search length: 120
- date filters use YYYY-MM-DD and must satisfy from <= to.

## Upgraded Endpoints (5)
1. Students list (Admin UI: /[tenant]/admin/students)
- Endpoint: GET /api/students
- Default sort: name asc
- Allowlisted sorts: name, status, parentCount, createdAt
- Allowlisted filters: status (ACTIVE|INACTIVE|ALL), levelId (string)

2. Sessions list (Admin UI: /[tenant]/admin/sessions)
- Endpoint: GET /api/sessions
- Default sort: startAt asc
- Allowlisted sorts: startAt, endAt, centerName, tutorName
- Allowlisted filters: centerId (string), tutorId (string), from (YYYY-MM-DD), to (YYYY-MM-DD)
- Notes: when no from is provided, results default to upcoming sessions (startAt >= now). Tutors are scoped to their own sessions.

3. Absence Requests queue (Admin UI: /[tenant]/admin/requests)
- Endpoint: GET /api/requests
- Default sort: createdAt desc
- Allowlisted sorts: createdAt, updatedAt, status
- Allowlisted filters: status (PENDING|APPROVED|DECLINED|WITHDRAWN|ALL), from (YYYY-MM-DD), to (YYYY-MM-DD)

4. Users list (Admin UI: /[tenant]/admin/users)
- Endpoint: GET /api/users
- Default sort: name asc
- Allowlisted sorts: name, email, role
- Allowlisted filters: role (Owner|Admin|Tutor|Parent|Student)

5. Groups/Classes list (Admin UI: /[tenant]/admin/groups)
- Endpoint: GET /api/groups
- Default sort: name asc
- Allowlisted sorts: name, type, centerName, programName, levelName, tutorsCount, studentsCount, status
- Allowlisted filters: type (GROUP|CLASS), isActive (boolean)

## Step 21.4A.1 Backend Unblock Endpoints (5)
Note: This section records the additional list endpoints upgraded so Step 21.4B UI can use the same contract.

1. Parents list (Admin UI: /[tenant]/admin/parents)
- Endpoint: GET /api/parents
- Default sort: email asc
- Allowlisted sorts: email, createdAt
- Allowlisted filters: hasStudents (boolean), from (YYYY-MM-DD), to (YYYY-MM-DD)

2. Programs list (Admin UI: /[tenant]/admin/programs)
- Endpoint: GET /api/programs
- Default sort: name asc
- Allowlisted sorts: name, createdAt
- Allowlisted filters: isActive (boolean)

3. Subjects list (Admin UI: /[tenant]/admin/subjects)
- Endpoint: GET /api/subjects
- Default sort: name asc
- Allowlisted sorts: name, createdAt
- Allowlisted filters: isActive (boolean)

4. Levels list (Admin UI: /[tenant]/admin/levels)
- Endpoint: GET /api/levels
- Default sort: name asc
- Allowlisted sorts: name, createdAt, sortOrder
- Allowlisted filters: isActive (boolean)

5. Audit log list (Admin UI: /[tenant]/admin/audit)
- Endpoint: GET /api/admin/audit
- Default sort: occurredAt desc
- Allowlisted sorts: occurredAt, action, actorType, entityType
- Allowlisted filters: actorType (PARENT|USER|ADMIN|TUTOR|SYSTEM), category (auth|requests|attendance|admin), action (string), entityType (string), from (YYYY-MM-DD), to (YYYY-MM-DD)

## UI Notes
- Debounce search client-side (admin table toolkit already does this).
- URL state is the source of truth for list state.
- Unknown filter/sort keys are rejected with 400 INVALID_QUERY.
