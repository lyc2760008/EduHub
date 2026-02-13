// Step 22.6 fixture helpers keep audit QA markers deterministic across seed + specs.
import { resolveStep203Fixtures } from "./step203";

export const STEP226_AUDIT_MARKER = "E2E_AUDIT_MARKER_123";
export const STEP226_INTERNAL_ONLY_SENTINEL =
  "INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_EXPORT";
export const STEP226_AUDIT_EVENT_COUNT = 36;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function buildStep226AuditEventId(
  tenantSlug: string,
  runId: string,
  index: number,
) {
  // Stable event IDs allow idempotent upserts while still producing enough rows for pagination.
  return `e2e-${tenantSlug}-${runId}-audit-step226-${pad2(index)}`;
}

export function buildStep226AuditEntityId(
  tenantSlug: string,
  runId: string,
  index: number,
) {
  // Entity IDs intentionally include "step226" so table search assertions remain deterministic.
  return `e2e-step226-${tenantSlug}-${runId}-entity-${pad2(index)}`;
}

export function buildStep226MarkerEntityId(tenantSlug: string, runId: string) {
  // Marker entity ID is a unique search token used by the audit list and CSV export tests.
  return `e2e-step226-${tenantSlug}-${runId}-${STEP226_AUDIT_MARKER}`;
}

export type Step226Fixtures = ReturnType<typeof resolveStep203Fixtures> & {
  markerEntityId: string;
};

export function resolveStep226Fixtures(): Step226Fixtures {
  const base = resolveStep203Fixtures();
  return {
    ...base,
    markerEntityId: buildStep226MarkerEntityId(base.tenantSlug, base.runId),
  };
}
