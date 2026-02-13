/**
 * @state.route /api/admin/audit
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Admin audit list endpoint reuses shared query + redaction to keep list/export behavior aligned.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { parseAuditEventQuery, queryAuditEventsPage } from "@/lib/audit/queryAuditEvents";
import { redactAuditEvent } from "@/lib/audit/redactAuditEvent";
import {
  getAuditEntityDisplay,
  resolveAuditEntityDisplayLookup,
} from "@/lib/audit/resolveAuditEntityDisplay";
import { requireRole } from "@/lib/rbac";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeRoleError(ctx);
    const tenantId = ctx.tenant.tenantId;

    const parsedQuery = parseAuditEventQuery(new URL(req.url).searchParams);
    const result = await queryAuditEventsPage({
      tenantId,
      parsedQuery,
    });
    const entityDisplayLookup = await resolveAuditEntityDisplayLookup({
      tenantId,
      rows: result.items,
    });

    const totalPages = Math.max(1, Math.ceil(result.totalCount / result.pageSize));
    const hasNextPage = result.page < totalPages;
    const hasPreviousPage = result.page > 1;

    return NextResponse.json({
      items: result.items.map((row) =>
        redactAuditEvent(row, {
          // Resolve tenant-scoped entity labels so admins can read names instead of opaque IDs.
          entityDisplay: getAuditEntityDisplay(row, entityDisplayLookup),
        }),
      ),
      pageInfo: {
        page: result.page,
        pageSize: result.pageSize,
        totalCount: result.totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      sort: result.sort,
      appliedFilters: result.appliedFilters,
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/audit failed", error);
    }
    return toReportErrorResponse(error);
  }
}
