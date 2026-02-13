/**
 * @state.route /api/portal/announcements/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Step 22.8 portal announcement detail endpoint (tenant-safe published visibility only).
 */
// Portal announcement detail endpoint returns title/body for published tenant-visible records only.
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { requireAnnouncementPortalAccess } from "@/lib/announcements/access";
import { toPortalDetailDTO } from "@/lib/announcements/dto";
import { getAnnouncementVisibilityFilter } from "@/lib/announcements/visibility";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteProps) {
  try {
    const access = await requireAnnouncementPortalAccess(req);
    if (access instanceof Response) return access;

    const { id: rawId } = await context.params;
    const id = rawId.trim();
    if (!id) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: { field: "id" } } },
        { status: 400 },
      );
    }

    const announcement = await prisma.announcement.findFirst({
      where: {
        id,
        ...getAnnouncementVisibilityFilter({
          tenantId: access.tenantId,
          role: access.role,
          userId: access.readerUserId,
        }),
      },
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    if (!announcement) {
      return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    const read = await prisma.announcementRead.findUnique({
      where: {
        announcementId_readerUserId: {
          announcementId: announcement.id,
          readerUserId: access.readerUserId,
        },
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({
      item: toPortalDetailDTO(announcement, !Boolean(read)),
    });
  } catch (error) {
    console.error("GET /api/portal/announcements/[id] failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
