// Step 20.3 fixture resolver uses deterministic IDs from the e2e seed script.
// Run `pnpm e2e:seed` before Playwright to ensure these records exist.
export type Step203Fixtures = {
  tenantSlug: string;
  secondaryTenantSlug: string;
  runId: string;
  accessCode: string;
  parentA1Email: string;
  tutorAEmail: string;
  tutorBEmail: string;
  studentId: string;
  unlinkedStudentId: string;
  // Step 22.2 coverage uses a dedicated fixture student whose linked parent has a missing email.
  missingEmailStudentId: string;
  upcomingSessionId: string;
  pastSessionId: string;
  tutorBSessionId: string;
  unlinkedSessionId: string;
  // Step 22.3 fixtures keep progress-note assertions deterministic across seed + tests.
  progressEmptyStudentId: string;
  progressSessionIds: string[];
  progressVisibleNotes: string[];
  progressInternalOnlySessionId: string;
  progressInternalOnlySentinel: string;
  crossTenantStudentId: string;
};

// Step 22.3 progress-note fixture sizing mirrors the product page size contract (10 initial + load more).
export const STEP223_PROGRESS_PAGE_SIZE = 10;
export const STEP223_PROGRESS_NOTE_COUNT = 12;
export const STEP223_INTERNAL_ONLY_SENTINEL =
  "INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_SHOW";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// Progress-note content is deterministic so ordering assertions stay stable in full-suite runs.
export function buildStep223ParentVisibleNote(index: number) {
  const suffix = index === STEP223_PROGRESS_NOTE_COUNT ? "NEWEST" : "VISIBLE";
  return `STEP223_NOTE_${pad2(index)}_${suffix}`;
}

function sanitizeRunId(value: string) {
  // Keep run id formatting consistent with seed helpers that sanitize IDs/emails.
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function requireAccessCode() {
  const accessCode =
    process.env.E2E_PARENT_ACCESS_CODE || process.env.SEED_DEFAULT_PASSWORD;
  if (!accessCode) {
    throw new Error(
      "Missing E2E_PARENT_ACCESS_CODE or SEED_DEFAULT_PASSWORD for Step 20.3 tests.",
    );
  }
  // Parent auth uppercases access codes before hashing, so normalize here.
  return accessCode.trim().toUpperCase();
}

export function resolveStep203Fixtures(): Step203Fixtures {
  const tenantSlug = process.env.E2E_TENANT_SLUG || "e2e-testing";
  const secondaryTenantSlug =
    process.env.E2E_SECOND_TENANT_SLUG ||
    (tenantSlug.toLowerCase().startsWith("e2e")
      ? `${tenantSlug}-secondary`
      : process.env.SEED_SECOND_TENANT_SLUG || "acme");
  const runId = sanitizeRunId(process.env.E2E_RUN_ID || "local");
  const emailSuffix = runId ? `+${runId}` : "";
  const progressSessionIds = Array.from(
    { length: STEP223_PROGRESS_NOTE_COUNT },
    (_, index) =>
      `e2e-${tenantSlug}-${runId}-session-progress-note-${pad2(index + 1)}`,
  );
  const progressVisibleNotes = Array.from(
    { length: STEP223_PROGRESS_NOTE_COUNT },
    (_, index) => buildStep223ParentVisibleNote(index + 1),
  );

  return {
    tenantSlug,
    secondaryTenantSlug,
    runId,
    accessCode: requireAccessCode(),
    parentA1Email: `e2e.parent.a1${emailSuffix}@example.com`,
    tutorAEmail: `e2e.tutor${emailSuffix}@example.com`,
    tutorBEmail: `e2e.tutor.b${emailSuffix}@example.com`,
    studentId: `e2e-${tenantSlug}-${runId}-student-s1`,
    unlinkedStudentId: `e2e-${tenantSlug}-${runId}-student-s2`,
    missingEmailStudentId: `e2e-${tenantSlug}-${runId}-student-s3`,
    upcomingSessionId: `e2e-${tenantSlug}-${runId}-session-upcoming`,
    pastSessionId: `e2e-${tenantSlug}-${runId}-session-past`,
    tutorBSessionId: `e2e-${tenantSlug}-${runId}-session-tutor-b`,
    unlinkedSessionId: `e2e-${tenantSlug}-${runId}-session-unlinked`,
    progressEmptyStudentId: `e2e-${tenantSlug}-${runId}-student-s5`,
    progressSessionIds,
    progressVisibleNotes,
    progressInternalOnlySessionId:
      `e2e-${tenantSlug}-${runId}-session-progress-internal-only`,
    progressInternalOnlySentinel: STEP223_INTERNAL_ONLY_SENTINEL,
    crossTenantStudentId:
      `e2e-${secondaryTenantSlug}-${runId}-student-cross-tenant-s1`,
  };
}
