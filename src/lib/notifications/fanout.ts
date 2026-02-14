// Server-only fanout helpers create notification rows and recipient rows in batch-safe chunks.
import "server-only";

import {
  AuditActorType,
  NotificationAudienceRole,
  type NotificationType,
  type Role,
} from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";

const TITLE_MAX_LENGTH = 120;
const BODY_PREVIEW_MAX_LENGTH = 200;
const RECIPIENT_INSERT_BATCH_SIZE = 500;

type CreateNotificationWithRecipientsInput = {
  tenantId: string;
  type: NotificationType;
  audienceRole: NotificationAudienceRole;
  title: string;
  bodyPreview?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  createdByUserId?: string | null;
  recipientUserIds: string[];
  correlationId?: string | null;
};

function normalizeCompactText(
  value: string | null | undefined,
  maxLength: number,
) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function uniqueIds(ids: string[]) {
  return Array.from(
    new Set(ids.map((value) => value.trim()).filter(Boolean)),
  );
}

function chunkIds(ids: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

// Create one notification row and fan out recipient rows without leaking recipient IDs in metadata.
export async function createNotificationWithRecipients(
  input: CreateNotificationWithRecipientsInput,
) {
  const recipientUserIds = uniqueIds(input.recipientUserIds);
  if (!recipientUserIds.length) {
    return {
      notificationId: null,
      recipientCount: 0,
    };
  }

  const title =
    normalizeCompactText(input.title, TITLE_MAX_LENGTH) ?? "notification";
  const bodyPreview = normalizeCompactText(
    input.bodyPreview,
    BODY_PREVIEW_MAX_LENGTH,
  );

  const notification = await prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      audienceRole: input.audienceRole,
      title,
      bodyPreview,
      targetType: normalizeCompactText(input.targetType, 40),
      targetId: normalizeCompactText(input.targetId, 80),
      createdByUserId: normalizeCompactText(input.createdByUserId, 80),
    },
    select: { id: true },
  });

  const recipientChunks = chunkIds(
    recipientUserIds,
    RECIPIENT_INSERT_BATCH_SIZE,
  );
  for (const chunk of recipientChunks) {
    await prisma.notificationRecipient.createMany({
      data: chunk.map((recipientUserId) => ({
        tenantId: input.tenantId,
        notificationId: notification.id,
        recipientUserId,
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditEvent({
    tenantId: input.tenantId,
    actorType: AuditActorType.SYSTEM,
    actorId: null,
    actorDisplay: null,
    action: AUDIT_ACTIONS.NOTIFICATION_CREATED,
    entityType: AUDIT_ENTITY_TYPES.NOTIFICATION,
    entityId: notification.id,
    correlationId: input.correlationId ?? null,
    metadata: {
      type: input.type,
      audienceRole: input.audienceRole,
      recipientCount: recipientUserIds.length,
    },
  });

  return {
    notificationId: notification.id,
    recipientCount: recipientUserIds.length,
  };
}

// Parent recipients are treated as active when they are linked to at least one student in the tenant.
export async function listActiveParentRecipientIds(tenantId: string) {
  const rows = await prisma.studentParent.findMany({
    where: { tenantId },
    select: { parentId: true },
    distinct: ["parentId"],
  });
  return rows.map((row) => row.parentId);
}

function toMembershipRoles(audienceRole: NotificationAudienceRole): Role[] {
  if (audienceRole === "TUTOR") {
    return ["Tutor"];
  }
  if (audienceRole === "ADMIN") {
    return ["Owner", "Admin"];
  }
  return [];
}

// Tutor/admin recipients are derived from tenant memberships to stay aligned with RBAC identities.
export async function listMembershipRecipientIds(args: {
  tenantId: string;
  audienceRole: NotificationAudienceRole;
}) {
  const roles = toMembershipRoles(args.audienceRole);
  if (!roles.length) return [];

  const rows = await prisma.tenantMembership.findMany({
    where: {
      tenantId: args.tenantId,
      role: {
        in: roles,
      },
    },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

// Student-parent links drive homework reviewed recipient fanout for parent inbox rows.
export async function listLinkedParentRecipientIdsByStudentIds(args: {
  tenantId: string;
  studentIds: string[];
}) {
  const normalizedStudentIds = uniqueIds(args.studentIds);
  if (!normalizedStudentIds.length) {
    return new Map<string, string[]>();
  }

  const rows = await prisma.studentParent.findMany({
    where: {
      tenantId: args.tenantId,
      studentId: { in: normalizedStudentIds },
    },
    select: {
      studentId: true,
      parentId: true,
    },
  });

  const byStudent = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!byStudent.has(row.studentId)) {
      byStudent.set(row.studentId, new Set<string>());
    }
    byStudent.get(row.studentId)?.add(row.parentId);
  }

  const result = new Map<string, string[]>();
  for (const [studentId, parentIds] of byStudent.entries()) {
    result.set(studentId, Array.from(parentIds));
  }
  return result;
}
