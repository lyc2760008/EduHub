// Step 23.3 fixtures keep notification IDs/counts deterministic across seed + E2E specs.
import { resolveStep228Fixtures } from "./step228";
import { resolveStep232Fixtures } from "./step232";

export const STEP233_INTERNAL_ONLY_SENTINEL =
  "INTERNAL_ONLY_TEST_SENTINEL_DO_NOT_STORE_IN_NOTIF";
export const STEP233_PARENT_UNREAD_CAP_COUNT = 105;
export const STEP233_TUTOR_UNREAD_COUNT = 3;

type Step233NotificationIds = {
  parentAnnouncementDeepLink: string;
  parentDeniedHomeworkDeepLink: string;
  parentUnreadFiller: string[];
  parentRead: string[];
  tutorAnnouncementDeepLink: string;
  tutorHomeworkUnread: string;
  tutorRequestUnread: string;
  tutorRead: string[];
  adminHomeworkUnread: string;
  adminRequestUnread: string;
  adminRead: string[];
};

type Step233SessionIds = {
  requestSeedSession: string;
};

type Step233RequestIds = {
  openRequest: string;
};

function pad3(value: number) {
  return String(value).padStart(3, "0");
}

export function buildStep233NotificationIds(
  tenantSlug: string,
  runId: string,
): Step233NotificationIds {
  const prefix = `e2e-${tenantSlug}-${runId}-notification-step233`;
  return {
    parentAnnouncementDeepLink: `${prefix}-parent-announcement-link`,
    parentDeniedHomeworkDeepLink: `${prefix}-parent-denied-homework-link`,
    // Remaining unread rows keep the parent badge capped at 99+ by default.
    parentUnreadFiller: Array.from(
      { length: STEP233_PARENT_UNREAD_CAP_COUNT - 2 },
      (_, index) => `${prefix}-parent-unread-${pad3(index + 1)}`,
    ),
    parentRead: [`${prefix}-parent-read-001`, `${prefix}-parent-read-002`],
    tutorAnnouncementDeepLink: `${prefix}-tutor-announcement-link`,
    tutorHomeworkUnread: `${prefix}-tutor-homework-unread`,
    tutorRequestUnread: `${prefix}-tutor-request-unread`,
    tutorRead: [`${prefix}-tutor-read-001`],
    adminHomeworkUnread: `${prefix}-admin-homework-unread`,
    adminRequestUnread: `${prefix}-admin-request-unread`,
    adminRead: [`${prefix}-admin-read-001`],
  };
}

export function buildStep233SessionIds(
  tenantSlug: string,
  runId: string,
): Step233SessionIds {
  return {
    requestSeedSession: `e2e-${tenantSlug}-${runId}-session-step233-request-seed`,
  };
}

export function buildStep233RequestIds(
  tenantSlug: string,
  runId: string,
): Step233RequestIds {
  return {
    openRequest: `e2e-${tenantSlug}-${runId}-request-step233-open-r1`,
  };
}

export type Step233Fixtures = ReturnType<typeof resolveStep232Fixtures> & {
  announcementIds: ReturnType<typeof resolveStep228Fixtures>["announcementIds"];
  notificationIds: Step233NotificationIds;
  step233SessionIds: Step233SessionIds;
  step233RequestIds: Step233RequestIds;
  notificationLeakSentinel: string;
};

export function resolveStep233Fixtures(): Step233Fixtures {
  const step232 = resolveStep232Fixtures();
  const step228 = resolveStep228Fixtures();

  if (
    step232.tenantSlug !== step228.tenantSlug ||
    step232.runId !== step228.runId
  ) {
    throw new Error("Step 23.3 fixtures require aligned Step 22.8/23.2 seeds.");
  }

  return {
    ...step232,
    announcementIds: step228.announcementIds,
    notificationIds: buildStep233NotificationIds(step232.tenantSlug, step232.runId),
    step233SessionIds: buildStep233SessionIds(step232.tenantSlug, step232.runId),
    step233RequestIds: buildStep233RequestIds(step232.tenantSlug, step232.runId),
    notificationLeakSentinel: STEP233_INTERNAL_ONLY_SENTINEL,
  };
}
