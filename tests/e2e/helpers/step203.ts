// Step 20.3 fixture resolver uses deterministic IDs from the e2e seed script.
// Run `pnpm e2e:seed` before Playwright to ensure these records exist.
export type Step203Fixtures = {
  tenantSlug: string;
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
};

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
  const runId = sanitizeRunId(process.env.E2E_RUN_ID || "local");
  const emailSuffix = runId ? `+${runId}` : "";

  return {
    tenantSlug,
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
  };
}
