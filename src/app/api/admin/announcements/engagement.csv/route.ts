/**
 * @state.route /api/admin/announcements/engagement.csv
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 22.8 engagement CSV export (aggregates only, filter parity with engagement JSON endpoint).
 */
// Admin engagement CSV export endpoint emits per-announcement aggregates only and caps rows for safe export performance.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { toCsv, type CsvColumn } from "@/lib/reports/adminReportCsv";
import {
  normalizeAnnouncementRoleError,
  toAnnouncementErrorResponse,
} from "@/lib/announcements/http";
import { parseAnnouncementEngagementQuery } from "@/lib/announcements/query";
import {
  queryAnnouncementEngagementRows,
  type AnnouncementEngagementRow,
} from "@/lib/announcements/engagement";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const EXPORT_MAX_ROWS = 10_000;

const csvColumns: CsvColumn<AnnouncementEngagementRow>[] = [
  {
    key: "announcementId",
    header: "announcementId",
    getValue: (row) => row.announcementId,
  },
  {
    key: "title",
    header: "title",
    getValue: (row) => row.title,
  },
  {
    key: "publishedAt",
    header: "publishedAt",
    getValue: (row) => row.publishedAt ?? "",
  },
  {
    key: "status",
    header: "status",
    getValue: (row) => row.status,
  },
  {
    key: "totalReads",
    header: "totalReads",
    getValue: (row) => row.totalReads,
  },
  {
    key: "readsParent",
    header: "readsParent",
    getValue: (row) => row.readsByRole.parent,
  },
  {
    key: "readsTutor",
    header: "readsTutor",
    getValue: (row) => row.readsByRole.tutor,
  },
  {
    key: "readsAdmin",
    header: "readsAdmin",
    getValue: (row) => row.readsByRole.admin,
  },
  {
    key: "eligibleCount",
    header: "eligibleCount",
    getValue: (row) => row.eligibleCount ?? "",
  },
  {
    key: "readRate",
    header: "readRate",
    getValue: (row) => row.readRate ?? "",
  },
];

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
      takeOverride: EXPORT_MAX_ROWS,
    });

    const csv = toCsv(csvColumns, result.rows);
    const headers = new Headers({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="announcements-engagement.csv"',
      "Cache-Control": "no-store",
    });

    if (result.totalCount > EXPORT_MAX_ROWS) {
      headers.set("X-Export-Truncated", "true");
    }

    return new NextResponse(csv, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("GET /api/admin/announcements/engagement.csv failed", error);
    return toAnnouncementErrorResponse(error);
  }
}
