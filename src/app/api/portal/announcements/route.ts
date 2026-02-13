/**
 * @state.route /api/portal/announcements
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.8 portal announcements feed (Parent + Tutor, tenant-safe, published-only).
 */
// Portal announcements list endpoint returns published tenant-visible announcements with unread flags.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireAnnouncementPortalAccess } from "@/lib/announcements/access";
import { toPortalListDTO } from "@/lib/announcements/dto";
import { getAnnouncementVisibilityFilter } from "@/lib/announcements/visibility";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const access = await requireAnnouncementPortalAccess(req);
    if (access instanceof Response) return access;

    const parsed = querySchema.safeParse({
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues.map((issue) => ({
              code: issue.code,
              path: issue.path.join("."),
            })),
          },
        },
        { status: 400 },
      );
    }

    const limit = parsed.data.limit ?? 20;
    const where = getAnnouncementVisibilityFilter({
      tenantId: access.tenantId,
      role: access.role,
      userId: access.readerUserId,
    });

    const rows = await prisma.announcement.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(parsed.data.cursor
        ? {
            cursor: { id: parsed.data.cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        title: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const announcementIds = pageRows.map((row) => row.id);
    const reads = announcementIds.length
      ? await prisma.announcementRead.findMany({
          where: {
            tenantId: access.tenantId,
            readerUserId: access.readerUserId,
            announcementId: {
              in: announcementIds,
            },
          },
          select: {
            announcementId: true,
          },
        })
      : [];
    const readSet = new Set(reads.map((item) => item.announcementId));

    return NextResponse.json({
      items: pageRows.map((row) =>
        toPortalListDTO(row, !readSet.has(row.id)),
      ),
      nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
    });
  } catch (error) {
    console.error("GET /api/portal/announcements failed", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 },
    );
  }
}
