import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import {
  parseAdminTableQuery,
  runAdminTableQuery,
} from "@/lib/reports/adminTableQuery";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";
import { getReportConfig, isReportId } from "@/lib/reports/reportRegistry";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type ReportRouteProps = {
  params: Promise<{
    reportId: string;
  }>;
};

// Unified report list endpoint with tenant-scoped RBAC and allowlisted query parsing.
export async function GET(req: NextRequest, { params }: ReportRouteProps) {
  let tenantId: string | undefined;
  const resolvedParams = await params;

  try {
    const reportIdParam = resolvedParams.reportId;
    if (!isReportId(reportIdParam)) {
      throw new ReportApiError(404, "NOT_FOUND");
    }

    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeRoleError(roleResult);
    }

    tenantId = roleResult.tenant.tenantId;
    const reportConfig = getReportConfig(reportIdParam);
    const parsedQuery = parseAdminTableQuery(
      new URL(req.url).searchParams,
      reportConfig as never,
    );
    const result = await runAdminTableQuery(reportConfig as never, {
      tenantId,
      parsedQuery: parsedQuery as never,
    });

    return NextResponse.json({
      reportId: reportIdParam,
      ...result,
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/reports/[reportId] failed", {
        tenantId,
        reportId: resolvedParams.reportId,
        error,
      });
    }
    return toReportErrorResponse(error);
  }
}
