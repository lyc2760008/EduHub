// Step 23.2 fixture resolver centralizes deterministic homework IDs and expected report values for E2E.
import { resolveStep224Fixtures } from "./step224";

export const STEP232_REPORT_EMPTY_SEARCH = "E2E_NO_MATCH_999";

export type Step232HomeworkItemIds = {
  parentWithAssignment: string;
  parentWithoutAssignment: string;
  parentUnlinked: string;
  tutorSubmitted: string;
  tutorNoSubmission: string;
  tutorOther: string;
  bulkEligible: string;
  bulkReviewed: string;
  bulkAssigned: string;
  slaAssigned: string;
};

export type Step232Fixtures = ReturnType<typeof resolveStep224Fixtures> & {
  homeworkItemIds: Step232HomeworkItemIds;
  crossTenantHomeworkItemId: string;
  bulkSearchTerm: string;
  reportEmptySearch: string;
  expectedSlaForOtherTutor: {
    assigned: number;
    submitted: number;
    reviewed: number;
    reviewedDurationCount: number;
    avgReviewHours: number;
  };
};

export function buildStep232HomeworkItemIds(
  tenantSlug: string,
  runId: string,
): Step232HomeworkItemIds {
  const prefix = `e2e-${tenantSlug}-${runId}-homework-step232`;
  return {
    parentWithAssignment: `${prefix}-parent-with-assignment`,
    parentWithoutAssignment: `${prefix}-parent-without-assignment`,
    parentUnlinked: `${prefix}-parent-unlinked`,
    tutorSubmitted: `${prefix}-tutor-submitted`,
    tutorNoSubmission: `${prefix}-tutor-no-submission`,
    tutorOther: `${prefix}-tutor-other`,
    bulkEligible: `${prefix}-bulk-eligible`,
    bulkReviewed: `${prefix}-bulk-reviewed`,
    bulkAssigned: `${prefix}-bulk-assigned`,
    slaAssigned: `${prefix}-sla-assigned`,
  };
}

export function buildStep232CrossTenantHomeworkItemId(
  secondaryTenantSlug: string,
  runId: string,
) {
  return `e2e-${secondaryTenantSlug}-${runId}-homework-step232-cross-tenant`;
}

export function resolveStep232Fixtures(): Step232Fixtures {
  const base = resolveStep224Fixtures();
  return {
    ...base,
    homeworkItemIds: buildStep232HomeworkItemIds(base.tenantSlug, base.runId),
    crossTenantHomeworkItemId: buildStep232CrossTenantHomeworkItemId(
      base.secondaryTenantSlug,
      base.runId,
    ),
    // Group sessions share a deterministic id prefix, so this search term narrows bulk tests to seeded rows.
    bulkSearchTerm: "step227-group",
    reportEmptySearch: STEP232_REPORT_EMPTY_SEARCH,
    // Seed data guarantees one assigned, one submitted, and one reviewed row for the non-owner tutor filter.
    expectedSlaForOtherTutor: {
      assigned: 1,
      submitted: 1,
      reviewed: 1,
      reviewedDurationCount: 1,
      avgReviewHours: 6,
    },
  };
}
