/**
 * @state.route /api/reports/weekly-attendance
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Weekly attendance report endpoint with tenant scoping and aggregate counts.
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  addUtcDays,
  assertCenterInTenant,
  buildReportError,
  formatDateOnly,
  parseDateOnly,
  parseReportParams,
  requireReportAccess,
  weeklyAttendanceQuerySchema,
} from "@/lib/reports/reportQuery";
import type { AttendanceStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Resolve tenant + membership and enforce Admin/Owner access.
    const access = await requireReportAccess(req);
    if (access instanceof Response) return access;
    const tenantId = access.tenant.tenantId;

    const params = parseReportParams(req, weeklyAttendanceQuerySchema);
    const weekStartDate = parseDateOnly(params.weekStart);
    const weekEndDate = addUtcDays(weekStartDate, 7);

    const centerError = await assertCenterInTenant(tenantId, params.centerId);
    if (centerError) return centerError;

    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        startAt: { gte: weekStartDate, lt: weekEndDate },
        ...(params.centerId ? { centerId: params.centerId } : {}),
      },
      select: { id: true },
    });

    const sessionIds = sessions.map((session) => session.id);

    // Initialize counts so we always return stable numeric keys.
    const statusCounts: Record<AttendanceStatus, number> = {
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
    };

    let rosterTotal = 0;

    if (sessionIds.length > 0) {
      rosterTotal = await prisma.sessionStudent.count({
        where: { tenantId, sessionId: { in: sessionIds } },
      });

      const attendanceGroups = await prisma.attendance.groupBy({
        by: ["status"],
        where: { tenantId, sessionId: { in: sessionIds } },
        _count: { status: true },
      });

      for (const group of attendanceGroups) {
        statusCounts[group.status] = group._count.status;
      }
    }

    const markedTotal = Object.values(statusCounts).reduce(
      (sum, value) => sum + value,
      0,
    );
    const unsetTotal = Math.max(0, rosterTotal - markedTotal);

    const summary = {
      rosterTotal,
      markedTotal,
      unsetTotal,
      present: statusCounts.PRESENT,
      absent: statusCounts.ABSENT,
      late: statusCounts.LATE,
      excused: statusCounts.EXCUSED,
    };

    const meta = {
      weekStart: formatDateOnly(weekStartDate),
      weekEnd: formatDateOnly(weekEndDate),
      ...(params.centerId ? { centerId: params.centerId } : {}),
    };

    return NextResponse.json({ meta, summary });
  } catch (error) {
    if (error instanceof ZodError) {
      return buildReportError(400, "ValidationError", "Invalid query params", {
        issues: error.issues,
      });
    }
    console.error("GET /api/reports/weekly-attendance failed", error);
    return buildReportError(500, "InternalError", "Internal server error");
  }
}
