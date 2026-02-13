// Step 22.8 fixtures keep announcement/read-receipt/report assertions deterministic across seed + E2E specs.
import { resolveStep203Fixtures } from "./step203";

export const STEP228_SEARCH_MARKER = "E2E_SEARCH_MARKER_ANN_123";
export const STEP228_NO_MATCH_SEARCH = "E2E_NO_MATCH_999";
export const STEP228_BODY_LEAK_SENTINEL =
  "E2E_ANNOUNCEMENT_BODY_DO_NOT_LEAK_TO_AUDIT_OR_EXPORT";
export const STEP228_PAGINATION_SEED_COUNT = 28;

export const STEP228_TITLES = {
  draft1: "E2E_DRAFT_1",
  pub1: "E2E_PUB_1",
  pub2: "E2E_PUB_2",
  arch1: "E2E_ARCH_1",
  search: `E2E_SEARCHABLE_${STEP228_SEARCH_MARKER}`,
  crossTenantPublished: "E2E_SECONDARY_TENANT_PUB_1",
} as const;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export type Step228AnnouncementIds = {
  draft1: string;
  pub1: string;
  pub2: string;
  arch1: string;
  search: string;
  paginatedPublished: string[];
  secondaryTenantPublished: string;
};

export function buildStep228AnnouncementIds(
  tenantSlug: string,
  secondaryTenantSlug: string,
  runId: string,
): Step228AnnouncementIds {
  const basePrefix = `e2e-${tenantSlug}-${runId}-announcement-step228`;
  const secondaryPrefix = `e2e-${secondaryTenantSlug}-${runId}-announcement-step228`;
  return {
    draft1: `${basePrefix}-draft-1`,
    pub1: `${basePrefix}-pub-1`,
    pub2: `${basePrefix}-pub-2`,
    arch1: `${basePrefix}-arch-1`,
    search: `${basePrefix}-search-1`,
    paginatedPublished: Array.from(
      { length: STEP228_PAGINATION_SEED_COUNT },
      (_, index) => `${basePrefix}-paged-${pad2(index + 1)}`,
    ),
    secondaryTenantPublished: `${secondaryPrefix}-pub-1`,
  };
}

export type Step228Fixtures = ReturnType<typeof resolveStep203Fixtures> & {
  announcementIds: Step228AnnouncementIds;
};

export function resolveStep228Fixtures(): Step228Fixtures {
  const base = resolveStep203Fixtures();
  return {
    ...base,
    announcementIds: buildStep228AnnouncementIds(
      base.tenantSlug,
      base.secondaryTenantSlug,
      base.runId,
    ),
  };
}
