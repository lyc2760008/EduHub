// Step 20.5 fixtures extend Step 20.4 sessions with staff auto-assist coverage.
import { resolveStep204Fixtures } from "./step204";

type AbsenceStaffSessionIds = {
  approved: string;
  pending: string;
  declined: string;
};

export type Step205Fixtures = ReturnType<typeof resolveStep204Fixtures> & {
  absenceStaffSessionIds: AbsenceStaffSessionIds;
};

export function resolveStep205Fixtures(): Step205Fixtures {
  const base = resolveStep204Fixtures();
  const tenantSlug = base.tenantSlug;

  // Guardrail: Step 20.5 tests only target the dedicated e2e tenant.
  if (tenantSlug !== "e2e-testing") {
    throw new Error(`Unexpected tenant slug ${tenantSlug} for Step 20.5 tests.`);
  }

  const prefix = `e2e-${tenantSlug}-${base.runId}`;

  return {
    ...base,
    absenceStaffSessionIds: {
      approved: `${prefix}-session-absence-staff-approved`,
      pending: `${prefix}-session-absence-staff-pending`,
      declined: `${prefix}-session-absence-staff-declined`,
    },
  };
}
