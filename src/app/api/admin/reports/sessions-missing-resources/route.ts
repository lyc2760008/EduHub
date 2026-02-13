/**
 * @state.route /api/admin/reports/sessions-missing-resources
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.9 missing resources report JSON endpoint.
 */
// Missing-resources report endpoint uses URL-backed admin table query state with tenant-safe filters.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import {
  parseMissingResourcesReportQuery,
  queryMissingResourcesReport,
} from "@/lib/resources/missingResourcesReport";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function GET(req: NextRequest) {
  let tenantId: string | undefined;
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeRoleError(roleResult);
    }

    tenantId = roleResult.tenant.tenantId;
    const parsedQuery = parseMissingResourcesReportQuery(
      new URL(req.url).searchParams,
    );
    const result = await queryMissingResourcesReport({
      tenantId,
      parsedQuery,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/reports/sessions-missing-resources failed", {
        tenantId,
        error,
      });
    }
    return toReportErrorResponse(error);
  }
}
