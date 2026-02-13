/**
 * @state.route /api/portal/announcements/[id]/read
 * @state.area api
 * @state.capabilities create:read_receipt
 * @state.notes Step 22.8 idempotent mark-read endpoint for portal announcements.
 */
// Portal mark-read endpoint upserts a single read receipt per announcement/user with tenant-safe visibility checks.
import { NextRequest, NextResponse } from "next/server";

import { requireAnnouncementPortalAccess } from "@/lib/announcements/access";
import { AnnouncementReadError, markAnnouncementRead } from "@/lib/announcements/markRead";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteProps) {
  try {
    const access = await requireAnnouncementPortalAccess(req);
    if (access instanceof Response) return access;

    const { id: rawId } = await context.params;
    const announcementId = rawId.trim();
    if (!announcementId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: { field: "id" } } },
        { status: 400 },
      );
    }

    const read = await markAnnouncementRead({
      tenantId: access.tenantId,
      announcementId,
      readerUserId: access.readerUserId,
      roleAtRead: access.roleAtRead,
      viewerRole: access.role,
    });

    return NextResponse.json({
      ok: true,
      readAt: read.readAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AnnouncementReadError) {
      return NextResponse.json(
        { error: { code: error.code } },
        { status: error.status },
      );
    }

    console.error("POST /api/portal/announcements/[id]/read failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
