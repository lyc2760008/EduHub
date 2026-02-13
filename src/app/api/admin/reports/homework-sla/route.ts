/**
 * @state.route /api/admin/reports/homework-sla
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.2 homework SLA report aggregates endpoint.
 */
// Homework SLA JSON endpoint returns tenant-scoped aggregates + breakdown rows (no file URLs or payload bytes).
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { buildHomeworkSlaWhere } from "@/lib/homework/query";
import { computeHomeworkSlaSummary } from "@/lib/homework/core";
import { toHomeworkErrorResponse } from "@/lib/homework/http";
import { parseHomeworkSlaFilters } from "@/lib/homework/report";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function GET(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) return roleResult;

    const filters = parseHomeworkSlaFilters(new URL(req.url).searchParams);
    const where = buildHomeworkSlaWhere(roleResult.tenant.tenantId, filters);
    const summary = await computeHomeworkSlaSummary({
      tenantId: roleResult.tenant.tenantId,
      where,
    });

    return NextResponse.json({
      filters,
      countsByStatus: summary.countsByStatus,
      avgReviewHours: summary.avgReviewHours,
      reviewedDurationCount: summary.reviewedDurationCount,
      breakdownRows: summary.breakdownRows,
    });
  } catch (error) {
    console.error("GET /api/admin/reports/homework-sla failed", error);
    return toHomeworkErrorResponse(error);
  }
}

