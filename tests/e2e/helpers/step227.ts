// Step 22.7 fixture resolver centralizes deterministic IDs for scheduling-efficiency E2E coverage.
import { resolveStep203Fixtures } from "./step203";

export const STEP227_INTERNAL_ONLY_SENTINEL =
  "INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_LEAK";
export const STEP227_ZOOM_LINK = "https://example.com/e2e-zoomlink";

export type Step227Fixtures = ReturnType<typeof resolveStep203Fixtures> & {
  groupId: string;
  groupSessionIds: string[];
  zoomSessionId: string;
  bulkCancelSessionIds: string[];
};

export function resolveStep227Fixtures(): Step227Fixtures {
  const base = resolveStep203Fixtures();
  const prefix = `e2e-${base.tenantSlug}-${base.runId}`;

  return {
    ...base,
    groupId: `${prefix}-group-step227-g1`,
    groupSessionIds: [
      `${prefix}-session-step227-group-1`,
      `${prefix}-session-step227-group-2`,
      `${prefix}-session-step227-group-3`,
    ],
    zoomSessionId: `${prefix}-session-step227-zoom`,
    bulkCancelSessionIds: [
      `${prefix}-session-step227-bulk-cancel-1`,
      `${prefix}-session-step227-bulk-cancel-2`,
      `${prefix}-session-step227-bulk-cancel-3`,
    ],
  };
}
