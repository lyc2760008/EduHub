// Step 20.4 fixtures for absence-request E2E coverage (write-lite).
import { resolveStep203Fixtures } from "./step203";

type AbsenceSessionIds = {
  happy: string;
  duplicate: string;
  resolve: string;
  resolved: string;
};

export type Step204Fixtures = {
  tenantSlug: string;
  runId: string;
  accessCode: string;
  parentA1Email: string;
  studentId: string;
  unlinkedStudentId: string;
  // Keep Step 20.3 upcoming session IDs available to later fixture layers.
  upcomingSessionId: string;
  pastSessionId: string;
  unlinkedSessionId: string;
  absenceSessionIds: AbsenceSessionIds;
};

export function resolveStep204Fixtures(): Step204Fixtures {
  const base = resolveStep203Fixtures();
  const tenantSlug = base.tenantSlug;

  // Guardrail: Step 20.4 tests only target the dedicated e2e tenant.
  if (tenantSlug !== "e2e-testing") {
    throw new Error(`Unexpected tenant slug ${tenantSlug} for Step 20.4 tests.`);
  }

  const prefix = `e2e-${tenantSlug}-${base.runId}`;

  return {
    tenantSlug,
    runId: base.runId,
    accessCode: base.accessCode,
    parentA1Email: base.parentA1Email,
    studentId: base.studentId,
    unlinkedStudentId: base.unlinkedStudentId,
    upcomingSessionId: base.upcomingSessionId,
    pastSessionId: base.pastSessionId,
    unlinkedSessionId: base.unlinkedSessionId,
    absenceSessionIds: {
      happy: `${prefix}-session-absence-happy`,
      duplicate: `${prefix}-session-absence-duplicate`,
      resolve: `${prefix}-session-absence-resolve`,
      resolved: `${prefix}-session-absence-resolved`,
    },
  };
}
