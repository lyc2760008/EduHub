/**
 * @state.route /api/admin/notifications/unread-count
 * @state.area api
 * @state.capabilities view:count
 * @state.notes Admin unread-count endpoint for homework/requests nav badges.
 */
// Admin unread-count endpoint is tenant-scoped and returns aggregate counts only.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { unreadCounts } from "@/lib/notifications/query";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function GET(req: NextRequest) {
  try {
    const access = await requireRole(req, ADMIN_ROLES);
    if (access instanceof Response) return access;

    const counts = await unreadCounts({
      tenantId: access.tenant.tenantId,
      recipientUserId: access.user.id,
    });

    return NextResponse.json({
      unreadCount: counts.unreadCount,
      countsByType: counts.countsByType,
    });
  } catch (error) {
    console.error("GET /api/admin/notifications/unread-count failed", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
