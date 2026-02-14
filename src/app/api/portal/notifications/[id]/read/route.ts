/**
 * @state.route /api/portal/notifications/[id]/read
 * @state.area api
 * @state.capabilities update:mark_read
 * @state.notes Step 23.3 idempotent single-notification read endpoint for parent+tutor users.
 */
// Parent+tutor mark-read endpoint updates only the caller's recipient row (idempotent when already read).
import { NextRequest, NextResponse } from "next/server";

import { requireNotificationPortalAccess } from "@/lib/notifications/access";
import { markNotificationRead } from "@/lib/notifications/query";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteProps) {
  try {
    const access = await requireNotificationPortalAccess(req);
    if (access instanceof Response) return access;

    const { id: rawId } = await context.params;
    const notificationId = rawId.trim();
    if (!notificationId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", details: { field: "id" } } },
        { status: 400 },
      );
    }

    const result = await markNotificationRead({
      tenantId: access.tenantId,
      recipientUserId: access.recipientUserId,
      notificationId,
    });
    if (!result.found) {
      // Return 404 to avoid confirming whether the ID exists for another user/tenant.
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      readAt: result.readAt ? result.readAt.toISOString() : null,
    });
  } catch (error) {
    console.error("POST /api/portal/notifications/[id]/read failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
