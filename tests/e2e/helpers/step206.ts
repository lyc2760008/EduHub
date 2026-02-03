// Step 20.6 fixtures isolate withdraw/resubmit and status hardening tests.
import { resolveStep205Fixtures } from "./step205";

type Step206SessionIds = {
  withdrawFuture: string;
  resubmit: string;
  approveLock: string;
  declineLock: string;
  withdrawPast: string;
  autoAssistWithdrawn: string;
  autoAssistApproved: string;
};

export type Step206Fixtures = ReturnType<typeof resolveStep205Fixtures> & {
  parentA0Email: string;
  step206SessionIds: Step206SessionIds;
};

export function resolveStep206Fixtures(): Step206Fixtures {
  const base = resolveStep205Fixtures();
  const tenantSlug = base.tenantSlug;

  // Guardrail: Step 20.6 tests only target the dedicated e2e tenant.
  if (tenantSlug !== "e2e-testing") {
    throw new Error(`Unexpected tenant slug ${tenantSlug} for Step 20.6 tests.`);
  }

  const prefix = `e2e-${tenantSlug}-${base.runId}`;
  const emailSuffix = base.runId ? `+${base.runId}` : "";

  return {
    ...base,
    parentA0Email: `e2e.parent.a0${emailSuffix}@example.com`,
    step206SessionIds: {
      withdrawFuture: `${prefix}-session-absence-withdraw-future`,
      resubmit: `${prefix}-session-absence-resubmit`,
      approveLock: `${prefix}-session-absence-approve-lock`,
      declineLock: `${prefix}-session-absence-decline-lock`,
      withdrawPast: `${prefix}-session-absence-withdraw-past`,
      autoAssistWithdrawn: `${prefix}-session-absence-autoassist-withdrawn`,
      autoAssistApproved: `${prefix}-session-absence-autoassist-approved`,
    },
  };
}
