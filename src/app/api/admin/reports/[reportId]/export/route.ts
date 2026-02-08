import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import {
  buildCsvFileName,
  toCsv,
  type CsvColumn,
} from "@/lib/reports/adminReportCsv";
import {
  parseAdminTableQuery,
  runAdminTableExportQuery,
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

type ReportExportRouteProps = {
  params: Promise<{
    reportId: string;
  }>;
};

// Unified CSV export endpoint that reuses report query logic and writes export audits.
export async function GET(req: NextRequest, { params }: ReportExportRouteProps) {
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
    const exportResult = await runAdminTableExportQuery(reportConfig as never, {
      tenantId,
      parsedQuery: parsedQuery as never,
    });

    const csv = toCsv(
      reportConfig.csvColumns as CsvColumn<(typeof exportResult.rows)[number]>[],
      exportResult.rows,
    );
    const fileName = buildCsvFileName(reportIdParam);

    // Export audit stores only safe summary metadata (keys and flags, no raw PII values).
    await writeAuditEvent({
      tenantId,
      actorType: "USER",
      actorId: roleResult.user.id,
      actorDisplay: roleResult.user.email,
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: AUDIT_ENTITY_TYPES.REPORT,
      entityId: reportIdParam,
      metadata: {
        reportId: reportIdParam,
        filterKeys: Object.keys(exportResult.appliedFilters),
        sortField: exportResult.sort.field,
        sortDir: exportResult.sort.dir,
        rowCount: exportResult.rows.length,
        totalCount: exportResult.totalCount,
        exportTruncated: Boolean(exportResult.exportTruncated),
        searchProvided: Boolean(parsedQuery.search),
      },
      request: req,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/reports/[reportId]/export failed", {
        tenantId,
        reportId: resolvedParams.reportId,
        error,
      });
    }
    return toReportErrorResponse(error);
  }
}
