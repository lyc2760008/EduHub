/**
 * @state.route /api/admin/announcements/engagement
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.8 engagement aggregates endpoint (per-announcement reads only; no per-user rows).
 */
// Admin engagement endpoint returns tenant-scoped announcement read aggregates with server-side filters and pagination.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import {
  normalizeAnnouncementRoleError,
  toAnnouncementErrorResponse,
} from "@/lib/announcements/http";
import {
  parseAnnouncementEngagementQuery,
  toPageInfo,
} from "@/lib/announcements/query";
import { queryAnnouncementEngagementRows } from "@/lib/announcements/engagement";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function GET(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeAnnouncementRoleError(roleResult);
    }
    const tenantId = roleResult.tenant.tenantId;

    const parsedQuery = parseAnnouncementEngagementQuery(
      new URL(req.url).searchParams,
    );
    const result = await queryAnnouncementEngagementRows({
      tenantId,
      parsedQuery,
    });

    return NextResponse.json({
      items: result.rows,
      pageInfo: toPageInfo({
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
      }),
      sort: result.sort,
      appliedFilters: result.appliedFilters,
    });
  } catch (error) {
    console.error("GET /api/admin/announcements/engagement failed", error);
    return toAnnouncementErrorResponse(error);
  }
}
