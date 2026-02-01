BEGIN;

-- 1) Scope to the tenant used for E2E (change slug if needed)
CREATE TEMP TABLE e2e_tenant AS
SELECT id FROM "Tenant" WHERE slug = 'demo';

-- 2) Collect E2E entities by naming/email patterns
CREATE TEMP TABLE e2e_users AS
SELECT DISTINCT u.id
FROM "User" u
JOIN "TenantMembership" tm ON tm."userId" = u.id
JOIN e2e_tenant t ON t.id = tm."tenantId"
WHERE u.email ILIKE 'e2e%example.com'
   OR u.email ILIKE '%+e2e%@example.com'
   OR u.email ILIKE 'parent-%@example.com'
   OR u.name  ILIKE 'E2E%';

CREATE TEMP TABLE e2e_parents AS
SELECT p.id
FROM "Parent" p
JOIN e2e_tenant t ON t.id = p."tenantId"
WHERE p.email ILIKE 'e2e%example.com'
   OR p.email ILIKE 'e2e.%@example.com'
   OR p.email ILIKE 'e2e-parent+%@example.com'
   OR p.email ILIKE 'parent-%@example.com';

CREATE TEMP TABLE e2e_students AS
SELECT s.id
FROM "Student" s
JOIN e2e_tenant t ON t.id = s."tenantId"
WHERE s."firstName" ILIKE 'E2E%'
   OR s."lastName" IN ('Session','ParentLink','ParentAuth','Unlinked','Student')
   OR s."notes" ILIKE 'E2E%';

CREATE TEMP TABLE e2e_centers AS
SELECT c.id
FROM "Center" c
JOIN e2e_tenant t ON t.id = c."tenantId"
WHERE c.name ILIKE 'E2E %' OR c.name ILIKE 'e2e-%';

CREATE TEMP TABLE e2e_subjects AS
SELECT s.id
FROM "Subject" s
JOIN e2e_tenant t ON t.id = s."tenantId"
WHERE s.name ILIKE 'E2E %' OR s.name ILIKE 'e2e-%';

CREATE TEMP TABLE e2e_levels AS
SELECT l.id
FROM "Level" l
JOIN e2e_tenant t ON t.id = l."tenantId"
WHERE l.name ILIKE 'E2E %' OR l.name ILIKE 'e2e-%';

CREATE TEMP TABLE e2e_programs AS
SELECT p.id
FROM "Program" p
JOIN e2e_tenant t ON t.id = p."tenantId"
WHERE p.name ILIKE 'E2E %' OR p.name ILIKE 'e2e-%';

CREATE TEMP TABLE e2e_groups AS
SELECT g.id
FROM "Group" g
JOIN e2e_tenant t ON t.id = g."tenantId"
WHERE g.name ILIKE 'E2E %' OR g.name ILIKE 'e2e-%';

CREATE TEMP TABLE e2e_sessions AS
SELECT DISTINCT s.id
FROM "Session" s
JOIN e2e_tenant t ON t.id = s."tenantId"
LEFT JOIN "SessionStudent" ss ON ss."sessionId" = s.id
LEFT JOIN e2e_students es ON es.id = ss."studentId"
LEFT JOIN e2e_groups   eg ON eg.id = s."groupId"
LEFT JOIN e2e_users    eu ON eu.id = s."tutorId"
WHERE es.id IS NOT NULL OR eg.id IS NOT NULL OR eu.id IS NOT NULL;

CREATE TEMP TABLE e2e_memberships AS
SELECT tm.id
FROM "TenantMembership" tm
JOIN e2e_tenant t ON t.id = tm."tenantId"
WHERE tm."userId" IN (SELECT id FROM e2e_users);

-- 3) Preview counts (sanity check)
SELECT
  (SELECT COUNT(*) FROM e2e_users)        AS e2e_users,
  (SELECT COUNT(*) FROM e2e_memberships)  AS e2e_memberships,
  (SELECT COUNT(*) FROM e2e_parents)      AS e2e_parents,
  (SELECT COUNT(*) FROM e2e_students)     AS e2e_students,
  (SELECT COUNT(*) FROM e2e_groups)       AS e2e_groups,
  (SELECT COUNT(*) FROM e2e_sessions)     AS e2e_sessions;

-- 4) Delete dependent rows first
DELETE FROM "SessionNote"
 WHERE "sessionId" IN (SELECT id FROM e2e_sessions);

DELETE FROM "Attendance"
 WHERE "sessionId" IN (SELECT id FROM e2e_sessions);

DELETE FROM "SessionStudent"
 WHERE "sessionId" IN (SELECT id FROM e2e_sessions);

DELETE FROM "Session"
 WHERE id IN (SELECT id FROM e2e_sessions);

DELETE FROM "GroupTutor"
 WHERE "groupId" IN (SELECT id FROM e2e_groups)
    OR "userId"  IN (SELECT id FROM e2e_users);

DELETE FROM "GroupStudent"
 WHERE "groupId" IN (SELECT id FROM e2e_groups)
    OR "studentId" IN (SELECT id FROM e2e_students);

DELETE FROM "StaffCenter"
 WHERE "centerId" IN (SELECT id FROM e2e_centers)
    OR "userId"   IN (SELECT id FROM e2e_users);

DELETE FROM "StudentParent"
 WHERE "studentId" IN (SELECT id FROM e2e_students)
    OR "parentId"  IN (SELECT id FROM e2e_parents);

-- Core entities
DELETE FROM "Parent"
 WHERE id IN (SELECT id FROM e2e_parents);

DELETE FROM "Student"
 WHERE id IN (SELECT id FROM e2e_students);

DELETE FROM "Group"
 WHERE id IN (SELECT id FROM e2e_groups);

DELETE FROM "Program"
 WHERE id IN (SELECT id FROM e2e_programs);

DELETE FROM "Level"
 WHERE id IN (SELECT id FROM e2e_levels);

DELETE FROM "Subject"
 WHERE id IN (SELECT id FROM e2e_subjects);

DELETE FROM "Center"
 WHERE id IN (SELECT id FROM e2e_centers);

-- Users (optional but included for full E2E cleanup)
DELETE FROM "TenantMembership"
 WHERE id IN (SELECT id FROM e2e_memberships);

DELETE FROM "User"
 WHERE id IN (SELECT id FROM e2e_users);

-- COMMIT;