// Notification event helpers keep trigger wiring minimal in route handlers.
import "server-only";

import type { NotificationType } from "@/generated/prisma/client";
import {
  createNotificationWithRecipients,
  listActiveParentRecipientIds,
  listLinkedParentRecipientIdsByStudentIds,
  listMembershipRecipientIds,
} from "@/lib/notifications/fanout";

const ANNOUNCEMENT_PREVIEW_MAX_LENGTH = 200;

function toShortPreview(value: string | null | undefined) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.slice(0, ANNOUNCEMENT_PREVIEW_MAX_LENGTH);
}

type BaseEventInput = {
  tenantId: string;
  createdByUserId?: string | null;
  correlationId?: string | null;
};

// Announcements fan out to all active parents and all tutor memberships in the tenant.
export async function emitAnnouncementPublishedNotifications(
  input: BaseEventInput & {
    announcementId: string;
    title: string;
    body?: string | null;
  },
) {
  const [parentRecipientIds, tutorRecipientIds] = await Promise.all([
    listActiveParentRecipientIds(input.tenantId),
    listMembershipRecipientIds({
      tenantId: input.tenantId,
      audienceRole: "TUTOR",
    }),
  ]);

  const bodyPreview = toShortPreview(input.body);

  await Promise.all([
    createNotificationWithRecipients({
      tenantId: input.tenantId,
      type: "ANNOUNCEMENT",
      audienceRole: "PARENT",
      title: input.title,
      bodyPreview,
      targetType: "announcement",
      targetId: input.announcementId,
      createdByUserId: input.createdByUserId ?? null,
      recipientUserIds: parentRecipientIds,
      correlationId: input.correlationId ?? null,
    }),
    createNotificationWithRecipients({
      tenantId: input.tenantId,
      type: "ANNOUNCEMENT",
      audienceRole: "TUTOR",
      title: input.title,
      bodyPreview,
      targetType: "announcement",
      targetId: input.announcementId,
      createdByUserId: input.createdByUserId ?? null,
      recipientUserIds: tutorRecipientIds,
      correlationId: input.correlationId ?? null,
    }),
  ]);
}

// Staff homework uploads notify linked parents so parent homework nav badges reflect new materials/feedback.
export async function emitHomeworkUploadedForParentsNotification(
  input: BaseEventInput & {
    homeworkItemId: string;
    studentId: string;
  },
) {
  const parentByStudent = await listLinkedParentRecipientIdsByStudentIds({
    tenantId: input.tenantId,
    studentIds: [input.studentId],
  });
  const parentRecipientIds = parentByStudent.get(input.studentId) ?? [];

  await createNotificationWithRecipients({
    tenantId: input.tenantId,
    type: "HOMEWORK",
    audienceRole: "PARENT",
    // Stored title is internal-facing; UI renders localized labels from type/action mapping.
    title: "notification.homework.updated",
    bodyPreview: null,
    targetType: "homework",
    targetId: input.homeworkItemId,
    createdByUserId: input.createdByUserId ?? null,
    recipientUserIds: parentRecipientIds,
    correlationId: input.correlationId ?? null,
  });
}

// Homework submission notifications target the assigned tutor and tenant admins.
export async function emitHomeworkSubmittedNotification(
  input: BaseEventInput & {
    homeworkItemId: string;
    tutorUserId: string | null;
  },
) {
  const adminRecipientIds = await listMembershipRecipientIds({
    tenantId: input.tenantId,
    audienceRole: "ADMIN",
  });

  await Promise.all([
    createNotificationWithRecipients({
      tenantId: input.tenantId,
      type: "HOMEWORK",
      audienceRole: "TUTOR",
      // Stored title is internal-facing; UI renders localized labels from type/action mapping.
      title: "notification.homework.submitted",
      bodyPreview: null,
      targetType: "homework",
      targetId: input.homeworkItemId,
      createdByUserId: input.createdByUserId ?? null,
      recipientUserIds: input.tutorUserId ? [input.tutorUserId] : [],
      correlationId: input.correlationId ?? null,
    }),
    createNotificationWithRecipients({
      tenantId: input.tenantId,
      type: "HOMEWORK",
      audienceRole: "ADMIN",
      // Stored title is internal-facing; UI renders localized labels from type/action mapping.
      title: "notification.homework.submitted",
      bodyPreview: null,
      targetType: "homework",
      targetId: input.homeworkItemId,
      createdByUserId: input.createdByUserId ?? null,
      recipientUserIds: adminRecipientIds,
      correlationId: input.correlationId ?? null,
    }),
  ]);
}

// Homework reviewed notifications target all linked parents for each reviewed item/student.
export async function emitHomeworkReviewedNotifications(
  input: BaseEventInput & {
    reviewedItems: Array<{
      homeworkItemId: string;
      studentId: string;
    }>;
  },
) {
  const studentIds = input.reviewedItems.map((item) => item.studentId);
  const parentByStudent = await listLinkedParentRecipientIdsByStudentIds({
    tenantId: input.tenantId,
    studentIds,
  });

  for (const item of input.reviewedItems) {
    const parentRecipientIds = parentByStudent.get(item.studentId) ?? [];
    await createNotificationWithRecipients({
      tenantId: input.tenantId,
      type: "HOMEWORK",
      audienceRole: "PARENT",
      // Stored title is internal-facing; UI renders localized labels from type/action mapping.
      title: "notification.homework.reviewed",
      bodyPreview: null,
      targetType: "homework",
      targetId: item.homeworkItemId,
      createdByUserId: input.createdByUserId ?? null,
      recipientUserIds: parentRecipientIds,
      correlationId: input.correlationId ?? null,
    });
  }
}

// Parent request submission notifications target tenant admins for admin request-tab badges.
export async function emitRequestSubmittedNotification(
  input: BaseEventInput & {
    requestId: string;
  },
) {
  const adminRecipientIds = await listMembershipRecipientIds({
    tenantId: input.tenantId,
    audienceRole: "ADMIN",
  });

  await createNotificationWithRecipients({
    tenantId: input.tenantId,
    type: "REQUEST",
    audienceRole: "ADMIN",
    // Stored title is internal-facing; UI renders localized labels from type/action mapping.
    title: "notification.request.submitted",
    bodyPreview: null,
    targetType: "request",
    targetId: input.requestId,
    createdByUserId: input.createdByUserId ?? null,
    recipientUserIds: adminRecipientIds,
    correlationId: input.correlationId ?? null,
  });
}

// Request notification triggers are enabled for parent request submission events in Step 23.3.
export const REQUEST_NOTIFICATION_TRIGGER_ENABLED = true;

// Shared constant keeps report/filter typing aligned even while request triggers are scaffold-only.
export const SUPPORTED_NOTIFICATION_TYPES: NotificationType[] = [
  "ANNOUNCEMENT",
  "HOMEWORK",
  "REQUEST",
];
