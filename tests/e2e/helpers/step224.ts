// Step 22.4 fixtures for tutor My Sessions + Run Session E2E coverage.
import { resolveStep203Fixtures } from "./step203";

export const STEP224_INTERNAL_ONLY_SENTINEL =
  "INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_SHOW";
export const STEP224_NOTE_1 = "E2E_NOTE_1";
export const STEP224_NOTE_2 = "E2E_NOTE_2";

export type Step224Fixtures = ReturnType<typeof resolveStep203Fixtures> & {
  tutorLoginEmail: string;
  tutorSessionIds: {
    tutorAFirst: string;
    tutorASecond: string;
    tutorBOther: string;
  };
  crossTenantSessionId: string;
};

export function resolveStep224Fixtures(): Step224Fixtures {
  const base = resolveStep203Fixtures();
  const prefix = `e2e-${base.tenantSlug}-${base.runId}`;
  const secondaryPrefix = `e2e-${base.secondaryTenantSlug}-${base.runId}`;

  // Prefer runtime tutor credentials because staging suites use deployment-scoped users.
  const tutorLoginEmail =
    process.env.E2E_TUTOR_EMAIL ||
    process.env.E2E_TUTOR1_EMAIL ||
    base.tutorAEmail;

  return {
    ...base,
    tutorLoginEmail: tutorLoginEmail.trim().toLowerCase(),
    tutorSessionIds: {
      tutorAFirst: `${prefix}-session-step224-tutor-a-1`,
      tutorASecond: `${prefix}-session-step224-tutor-a-2`,
      tutorBOther: `${prefix}-session-step224-tutor-b-1`,
    },
    crossTenantSessionId: `${secondaryPrefix}-session-step224-cross-tenant-1`,
  };
}
