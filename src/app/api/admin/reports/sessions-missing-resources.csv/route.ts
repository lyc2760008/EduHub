/**
 * @state.route /api/admin/reports/sessions-missing-resources.csv
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.9 missing resources report CSV export endpoint.
 */
// Missing-resources CSV export reuses the JSON query builder and caps rows for safe downloads.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { toCsv, type CsvColumn } from "@/lib/reports/adminReportCsv";
import {
  exportMissingResourcesReport,
  parseMissingResourcesReportQuery,
  type MissingResourcesReportRow,
} from "@/lib/resources/missingResourcesReport";
import {
  ReportApiError,
  normalizeRoleError,
  toReportErrorResponse,
} from "@/lib/reports/adminReportErrors";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const MAX_EXPORT_ROWS = 10_000;

const CSV_COLUMNS: CsvColumn<MissingResourcesReportRow>[] = [
  {
    key: "startDateTime",
    header: "sessionDateTime",
    getValue: (row) => row.startDateTime,
  },
  {
    key: "contextLabel",
    header: "context",
    getValue: (row) => row.contextLabel ?? "",
  },
  {
    key: "tutorName",
    header: "tutor",
    getValue: (row) => row.tutorName,
  },
  {
    key: "hasResources",
    header: "hasResources",
    getValue: (row) => (row.hasResources ? "Yes" : "No"),
  },
  {
    key: "resourceCount",
    header: "resourceCount",
    getValue: (row) => row.resourceCount,
  },
];

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
    const exportResult = await exportMissingResourcesReport({
      tenantId,
      parsedQuery,
      maxRows: MAX_EXPORT_ROWS,
    });

    const csv = toCsv(CSV_COLUMNS, exportResult.rows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="sessions-missing-resources.csv"',
        "Cache-Control": "no-store",
        "X-Export-Truncated": exportResult.exportTruncated ? "1" : "0",
      },
    });
  } catch (error) {
    if (!(error instanceof ReportApiError)) {
      console.error("GET /api/admin/reports/sessions-missing-resources.csv failed", {
        tenantId,
        error,
      });
    }
    return toReportErrorResponse(error);
  }
}
