// Server-only notification query helpers keep recipient inbox reads and read-state updates tenant-safe.
import "server-only";

import type { NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { toInboxListDTO } from "@/lib/notifications/dto";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type NotificationListStatus = "all" | "unread";

export type ListRecipientNotificationsInput = {
  tenantId: string;
  recipientUserId: string;
  status?: NotificationListStatus;
  types?: NotificationType[];
  cursor?: string | null;
  limit?: number;
};

type CursorShape = {
  createdAt: string;
  notificationId: string;
};

function encodeCursor(value: CursorShape) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): CursorShape | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as CursorShape;
    if (
      typeof parsed?.createdAt !== "string" ||
      typeof parsed?.notificationId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toLimit(value: number | null | undefined) {
  if (!value || Number.isNaN(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

// List recipient-scoped notifications using createdAt/id cursor ordering for stable pagination.
export async function listRecipientNotifications(
  input: ListRecipientNotificationsInput,
) {
  const cursor = decodeCursor(input.cursor);
  const limit = toLimit(input.limit);

  const where: Prisma.NotificationRecipientWhereInput = {
    tenantId: input.tenantId,
    recipientUserId: input.recipientUserId,
    ...(input.status === "unread" ? { readAt: null } : {}),
    ...(input.types?.length
      ? {
          notification: {
            type: {
              in: input.types,
            },
          },
        }
      : {}),
  };

  if (cursor) {
    const cursorCreatedAt = new Date(cursor.createdAt);
    if (!Number.isNaN(cursorCreatedAt.getTime())) {
      where.OR = [
        { notification: { createdAt: { lt: cursorCreatedAt } } },
        {
          AND: [
            { notification: { createdAt: cursorCreatedAt } },
            { notificationId: { lt: cursor.notificationId } },
          ],
        },
      ];
    }
  }

  const rows = await prisma.notificationRecipient.findMany({
    where,
    orderBy: [{ notification: { createdAt: "desc" } }, { notificationId: "desc" }],
    take: limit + 1,
    select: {
      readAt: true,
      notification: {
        select: {
          id: true,
          type: true,
          title: true,
          bodyPreview: true,
          createdAt: true,
          targetType: true,
          targetId: true,
          targetUrl: true,
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map((row) =>
    toInboxListDTO({
      id: row.notification.id,
      type: row.notification.type,
      title: row.notification.title,
      bodyPreview: row.notification.bodyPreview,
      createdAt: row.notification.createdAt,
      readAt: row.readAt,
      targetType: row.notification.targetType,
      targetId: row.notification.targetId,
      targetUrl: row.notification.targetUrl,
    }),
  );

  const last = pageRows[pageRows.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: last.notification.createdAt.toISOString(),
            notificationId: last.notification.id,
          })
        : null,
  };
}

// Mark one notification as read for the current recipient; idempotent when already read.
export async function markNotificationRead(args: {
  tenantId: string;
  recipientUserId: string;
  notificationId: string;
}) {
  const existing = await prisma.notificationRecipient.findFirst({
    where: {
      tenantId: args.tenantId,
      recipientUserId: args.recipientUserId,
      notificationId: args.notificationId,
    },
    select: {
      id: true,
      readAt: true,
    },
  });

  if (!existing) {
    return {
      found: false,
      changed: false,
      readAt: null as Date | null,
    };
  }

  if (existing.readAt) {
    return {
      found: true,
      changed: false,
      readAt: existing.readAt,
    };
  }

  const now = new Date();
  const updated = await prisma.notificationRecipient.update({
    where: {
      id: existing.id,
    },
    data: {
      readAt: now,
    },
    select: {
      readAt: true,
    },
  });

  return {
    found: true,
    changed: true,
    readAt: updated.readAt,
  };
}

// Mark unread notifications as read for one recipient in one tenant-scoped updateMany (optionally filtered by type).
export async function markAllRead(args: {
  tenantId: string;
  recipientUserId: string;
  types?: NotificationType[];
}) {
  const now = new Date();
  const result = await prisma.notificationRecipient.updateMany({
    where: {
      tenantId: args.tenantId,
      recipientUserId: args.recipientUserId,
      readAt: null,
      ...(args.types?.length
        ? {
            notification: {
              type: {
                in: args.types,
              },
            },
          }
        : {}),
    },
    data: {
      readAt: now,
    },
  });
  return result.count;
}

// Unread count query is a simple tenant+recipient scoped count for badge rendering.
export async function unreadCount(args: {
  tenantId: string;
  recipientUserId: string;
  types?: NotificationType[];
}) {
  return prisma.notificationRecipient.count({
    where: {
      tenantId: args.tenantId,
      recipientUserId: args.recipientUserId,
      readAt: null,
      ...(args.types?.length
        ? {
            notification: {
              type: {
                in: args.types,
              },
            },
          }
        : {}),
    },
  });
}

// Grouped unread counts keep nav badges type-aware without exposing recipient identifiers.
export async function unreadCounts(args: {
  tenantId: string;
  recipientUserId: string;
}) {
  const [announcement, homework, request] = await Promise.all([
    unreadCount({
      tenantId: args.tenantId,
      recipientUserId: args.recipientUserId,
      types: ["ANNOUNCEMENT"],
    }),
    unreadCount({
      tenantId: args.tenantId,
      recipientUserId: args.recipientUserId,
      types: ["HOMEWORK"],
    }),
    unreadCount({
      tenantId: args.tenantId,
      recipientUserId: args.recipientUserId,
      types: ["REQUEST"],
    }),
  ]);

  const total = announcement + homework + request;
  return {
    unreadCount: total,
    countsByType: {
      announcement,
      homework,
      request,
    },
  };
}
