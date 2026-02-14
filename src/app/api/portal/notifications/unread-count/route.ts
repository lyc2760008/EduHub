/**
 * @state.route /api/portal/notifications/unread-count
 * @state.area api
 * @state.capabilities view:count
 * @state.notes Step 23.3 unread badge count endpoint for parent+tutor notifications.
 */
// Parent+tutor unread-count endpoint returns tenant-scoped total + per-type counts for nav badges.
import { NextRequest, NextResponse } from "next/server";

import { requireNotificationPortalAccess } from "@/lib/notifications/access";
import { unreadCounts } from "@/lib/notifications/query";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const access = await requireNotificationPortalAccess(req);
    if (access instanceof Response) return access;

    const counts = await unreadCounts({
      tenantId: access.tenantId,
      recipientUserId: access.recipientUserId,
    });

    return NextResponse.json({
      unreadCount: counts.unreadCount,
      countsByType: counts.countsByType,
    });
  } catch (error) {
    console.error("GET /api/portal/notifications/unread-count failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
