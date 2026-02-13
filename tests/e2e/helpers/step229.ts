// Step 22.9 fixture resolver keeps session-resource IDs/titles deterministic across seed + E2E specs.
import { resolveStep224Fixtures } from "./step224";

export const STEP229_NO_MATCH_SEARCH = "E2E_NO_MATCH_999";
export const STEP229_INTERNAL_LEAK_SENTINEL =
  "INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_LEAK";

export const STEP229_RESOURCE_TITLES = {
  existing: "E2E_RESOURCE_EXISTING",
  duplicateSeed: "E2E_RESOURCE_DUPLICATE_SEED",
  crossTenant: "E2E_SECONDARY_RESOURCE",
} as const;

export const STEP229_RESOURCE_URLS = {
  existing: "https://example.com/e2e-resource",
  duplicateSeed: "https://example.com/e2e-duplicate",
  crossTenant: "https://example.com/e2e-secondary-resource",
} as const;

export type Step229ResourceIds = {
  primaryExisting: string;
  primaryDuplicateSeed: string;
  secondaryTenantResource: string;
};

export function buildStep229ResourceIds(
  tenantSlug: string,
  secondaryTenantSlug: string,
  runId: string,
): Step229ResourceIds {
  const prefix = `e2e-${tenantSlug}-${runId}-resource-step229`;
  const secondaryPrefix = `e2e-${secondaryTenantSlug}-${runId}-resource-step229`;
  return {
    primaryExisting: `${prefix}-existing`,
    primaryDuplicateSeed: `${prefix}-duplicate-seed`,
    secondaryTenantResource: `${secondaryPrefix}-cross-tenant`,
  };
}

export type Step229Fixtures = ReturnType<typeof resolveStep224Fixtures> & {
  reportNoMatchSearch: string;
  sessionIds: {
    tutorAFirst: string;
    tutorASecond: string;
    tutorBOther: string;
    unlinked: string;
    crossTenant: string;
  };
  resourceIds: Step229ResourceIds;
};

export function resolveStep229Fixtures(): Step229Fixtures {
  const base = resolveStep224Fixtures();
  return {
    ...base,
    reportNoMatchSearch: STEP229_NO_MATCH_SEARCH,
    sessionIds: {
      tutorAFirst: base.tutorSessionIds.tutorAFirst,
      tutorASecond: base.tutorSessionIds.tutorASecond,
      tutorBOther: base.tutorSessionIds.tutorBOther,
      unlinked: base.unlinkedSessionId,
      crossTenant: base.crossTenantSessionId,
    },
    resourceIds: buildStep229ResourceIds(
      base.tenantSlug,
      base.secondaryTenantSlug,
      base.runId,
    ),
  };
}
