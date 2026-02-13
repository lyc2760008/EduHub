// Server-only read writer enforces tenant-safe visibility and idempotent read receipt creation.
import "server-only";

import type { AnnouncementReadRole, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnnouncementVisibilityFilter } from "@/lib/announcements/visibility";

type MarkAnnouncementReadInput = {
  tenantId: string;
  announcementId: string;
  readerUserId: string;
  roleAtRead: AnnouncementReadRole;
  viewerRole: Role;
};

export class AnnouncementReadError extends Error {
  status: number;
  code: "NOT_FOUND" | "FORBIDDEN";

  constructor(status: number, code: "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AnnouncementReadError";
    this.status = status;
    this.code = code;
  }
}

export async function markAnnouncementRead(input: MarkAnnouncementReadInput) {
  const visibilityWhere = getAnnouncementVisibilityFilter({
    tenantId: input.tenantId,
    role: input.viewerRole,
    userId: input.readerUserId,
  });

  const announcement = await prisma.announcement.findFirst({
    where: {
      id: input.announcementId,
      ...visibilityWhere,
    },
    select: {
      id: true,
    },
  });

  if (!announcement) {
    throw new AnnouncementReadError(404, "NOT_FOUND", "Announcement not found");
  }

  const read = await prisma.announcementRead.upsert({
    where: {
      announcementId_readerUserId: {
        announcementId: announcement.id,
        readerUserId: input.readerUserId,
      },
    },
    // Idempotent update preserves the original read timestamp and avoids double-counting.
    update: {},
    create: {
      tenantId: input.tenantId,
      announcementId: announcement.id,
      readerUserId: input.readerUserId,
      roleAtRead: input.roleAtRead,
    },
    select: {
      readAt: true,
    },
  });

  return read;
}
