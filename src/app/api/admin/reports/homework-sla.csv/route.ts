/**
 * @state.route /api/admin/reports/homework-sla.csv
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.2 homework SLA CSV export endpoint.
 */
// Homework SLA CSV endpoint exports aggregate-safe rows only and reuses JSON filter semantics.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import type { CsvColumn } from "@/lib/reports/adminReportCsv";
import { toCsv } from "@/lib/reports/adminReportCsv";
import { buildHomeworkSlaWhere } from "@/lib/homework/query";
import { computeHomeworkSlaSummary } from "@/lib/homework/core";
import { toHomeworkErrorResponse } from "@/lib/homework/http";
import { parseHomeworkSlaFilters } from "@/lib/homework/report";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type CsvRow = {
  center: string;
  tutor: string;
  assigned: number;
  submitted: number;
  reviewed: number;
  reviewedDurationCount: number;
  avgReviewHours: number | null;
};

const CSV_COLUMNS: CsvColumn<CsvRow>[] = [
  {
    key: "center",
    header: "center",
    getValue: (row) => row.center,
  },
  {
    key: "tutor",
    header: "tutor",
    getValue: (row) => row.tutor,
  },
  {
    key: "assigned",
    header: "assigned",
    getValue: (row) => row.assigned,
  },
  {
    key: "submitted",
    header: "submitted",
    getValue: (row) => row.submitted,
  },
  {
    key: "reviewed",
    header: "reviewed",
    getValue: (row) => row.reviewed,
  },
  {
    key: "reviewedDurationCount",
    header: "reviewedDurationCount",
    getValue: (row) => row.reviewedDurationCount,
  },
  {
    key: "avgReviewHours",
    header: "avgReviewHours",
    getValue: (row) =>
      row.avgReviewHours === null ? "" : row.avgReviewHours.toFixed(2),
  },
];

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

    const csvRows: CsvRow[] = summary.breakdownRows.map((row) => ({
      center: row.centerName ?? "",
      tutor: row.tutorDisplay ?? "",
      assigned: row.assignedCount,
      submitted: row.submittedCount,
      reviewed: row.reviewedCount,
      reviewedDurationCount: row.reviewedDurationCount,
      avgReviewHours: row.avgReviewHours,
    }));
    const csv = toCsv(CSV_COLUMNS, csvRows);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="homework-sla.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/reports/homework-sla.csv failed", error);
    return toHomeworkErrorResponse(error);
  }
}

