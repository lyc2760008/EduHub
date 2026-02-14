/**
 * @state.route /api/admin/reports/notifications-engagement.csv
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.3 notifications engagement CSV export (aggregate rows only).
 */
// Admin notifications engagement CSV endpoint exports aggregate metrics only (no recipient/user rows).
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { toCsv, type CsvColumn, buildCsvFileName } from "@/lib/reports/adminReportCsv";
import { requireRole } from "@/lib/rbac";
import { normalizeRoleError, toReportErrorResponse } from "@/lib/reports/adminReportErrors";
import {
  parseNotificationsEngagementQuery,
  queryNotificationsEngagementForExport,
  type NotificationsEngagementRow,
} from "@/lib/notifications/report";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const csvColumns: CsvColumn<NotificationsEngagementRow>[] = [
  {
    key: "type",
    header: "type",
    getValue: (row) => row.type,
  },
  {
    key: "audienceRole",
    header: "audienceRole",
    getValue: (row) => row.audienceRole,
  },
  {
    key: "sentCount",
    header: "sentCount",
    getValue: (row) => row.sentCount,
  },
  {
    key: "readCount",
    header: "readCount",
    getValue: (row) => row.readCount,
  },
  {
    key: "readRate",
    header: "readRate",
    getValue: (row) => row.readRate,
  },
  {
    key: "avgTimeToReadHours",
    header: "avgTimeToReadHours",
    getValue: (row) => row.avgTimeToReadHours ?? "",
  },
];

export async function GET(req: NextRequest) {
  try {
    const roleResult = await requireRole(req, ADMIN_ROLES);
    if (roleResult instanceof Response) {
      return await normalizeRoleError(roleResult);
    }

    const parsedQuery = parseNotificationsEngagementQuery(
      new URL(req.url).searchParams,
    );
    const result = await queryNotificationsEngagementForExport({
      tenantId: roleResult.tenant.tenantId,
      parsedQuery,
    });

    const csv = toCsv(csvColumns, result.rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildCsvFileName("notifications-engagement")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/reports/notifications-engagement.csv failed", error);
    return toReportErrorResponse(error);
  }
}
