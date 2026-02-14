/**
 * @state.route /api/admin/reports/notifications-engagement
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.3 notifications engagement aggregates endpoint (no per-user rows).
 */
// Admin notifications engagement endpoint returns aggregate rows and summary metrics only.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/rbac";
import { normalizeRoleError, toReportErrorResponse } from "@/lib/reports/adminReportErrors";
import {
  parseNotificationsEngagementQuery,
  queryNotificationsEngagement,
} from "@/lib/notifications/report";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function GET(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeRoleError(roleResult);
    }

    const parsedQuery = parseNotificationsEngagementQuery(
      new URL(req.url).searchParams,
    );
    const result = await queryNotificationsEngagement({
      tenantId: roleResult.tenant.tenantId,
      parsedQuery,
    });

    return NextResponse.json({
      items: result.rows,
      pageInfo: result.pageInfo,
      sort: result.sort,
      appliedFilters: result.appliedFilters,
      summary: result.summary,
    });
  } catch (error) {
    console.error("GET /api/admin/reports/notifications-engagement failed", error);
    return toReportErrorResponse(error);
  }
}
