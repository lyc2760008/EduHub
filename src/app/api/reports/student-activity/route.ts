/**
 * @state.route /api/reports/student-activity
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Student activity report endpoint with tenant-safe aggregation over sessions.
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  addUtcDays,
  assertCenterInTenant,
  buildReportError,
  formatDateOnly,
  getUtcToday,
  parseDateOnly,
  parseReportParams,
  requireReportAccess,
  studentActivityQuerySchema,
} from "@/lib/reports/reportQuery";
import type { AttendanceStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";

type StudentRollup = {
  studentId: string;
  sessionsScheduled: number;
  attendanceMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  lastSessionAt: Date | null;
};

export async function GET(req: NextRequest) {
  try {
    // Resolve tenant + membership and enforce Admin/Owner access.
    const access = await requireReportAccess(req);
    if (access instanceof Response) return access;
    const tenantId = access.tenant.tenantId;

    const params = parseReportParams(req, studentActivityQuerySchema);

    // Default to the last 30 days when date params are omitted.
    const today = getUtcToday();
    const defaultFrom = addUtcDays(today, -30);
    const defaultTo = today;

    const fromDate = params.from ? parseDateOnly(params.from) : defaultFrom;
    const toDate = params.to ? parseDateOnly(params.to) : defaultTo;

    if (fromDate > toDate) {
      return buildReportError(400, "ValidationError", "from must be <= to", {
        from: formatDateOnly(fromDate),
        to: formatDateOnly(toDate),
      });
    }

    const centerError = await assertCenterInTenant(tenantId, params.centerId);
    if (centerError) return centerError;

    const rangeEndExclusive = addUtcDays(toDate, 1);

    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        startAt: { gte: fromDate, lt: rangeEndExclusive },
        ...(params.centerId ? { centerId: params.centerId } : {}),
      },
      select: { id: true, startAt: true },
    });

    const sessionStartById = new Map(
      sessions.map((session) => [session.id, session.startAt]),
    );
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length === 0) {
      const meta = {
        from: formatDateOnly(fromDate),
        to: formatDateOnly(toDate),
        ...(params.centerId ? { centerId: params.centerId } : {}),
      };
      return NextResponse.json({ meta, rows: [] });
    }

    const sessionStudents = await prisma.sessionStudent.findMany({
      where: { tenantId, sessionId: { in: sessionIds } },
      select: { studentId: true, sessionId: true },
    });

    const attendances = await prisma.attendance.findMany({
      where: { tenantId, sessionId: { in: sessionIds } },
      select: { studentId: true, status: true },
    });

    // Aggregate per-student metrics in memory to avoid per-row queries.
    const rollups = new Map<string, StudentRollup>();

    const getRollup = (studentId: string) => {
      let rollup = rollups.get(studentId);
      if (!rollup) {
        rollup = {
          studentId,
          sessionsScheduled: 0,
          attendanceMarked: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          lastSessionAt: null,
        };
        rollups.set(studentId, rollup);
      }
      return rollup;
    };

    for (const entry of sessionStudents) {
      const rollup = getRollup(entry.studentId);
      rollup.sessionsScheduled += 1;

      const sessionStart = sessionStartById.get(entry.sessionId);
      if (sessionStart) {
        if (!rollup.lastSessionAt || sessionStart > rollup.lastSessionAt) {
          rollup.lastSessionAt = sessionStart;
        }
      }
    }

    for (const attendance of attendances) {
      const rollup = getRollup(attendance.studentId);
      rollup.attendanceMarked += 1;

      const status = attendance.status as AttendanceStatus;
      if (status === "PRESENT") rollup.present += 1;
      if (status === "ABSENT") rollup.absent += 1;
      if (status === "LATE") rollup.late += 1;
      if (status === "EXCUSED") rollup.excused += 1;
    }

    const studentIds = Array.from(rollups.keys());

    const students = await prisma.student.findMany({
      where: { tenantId, id: { in: studentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const rows = students.map((student) => {
      const rollup = rollups.get(student.id);
      const studentName =
        student.preferredName ?? `${student.firstName} ${student.lastName}`;

      return {
        studentId: student.id,
        studentName,
        sessionsScheduled: rollup?.sessionsScheduled ?? 0,
        attendanceMarked: rollup?.attendanceMarked ?? 0,
        present: rollup?.present ?? 0,
        absent: rollup?.absent ?? 0,
        late: rollup?.late ?? 0,
        excused: rollup?.excused ?? 0,
        lastSessionAt: rollup?.lastSessionAt ?? null,
      };
    });
    // Apply a deterministic ordering before optional limiting for dashboard widgets.
    const orderedRows = params.limit
      ? [...rows].sort((a, b) => {
          const scheduledDiff = b.sessionsScheduled - a.sessionsScheduled;
          if (scheduledDiff !== 0) return scheduledDiff;
          const lastA = a.lastSessionAt ? a.lastSessionAt.getTime() : 0;
          const lastB = b.lastSessionAt ? b.lastSessionAt.getTime() : 0;
          if (lastA !== lastB) return lastB - lastA;
          return a.studentName.localeCompare(b.studentName);
        })
      : rows;
    const limitedRows = params.limit
      ? orderedRows.slice(0, params.limit)
      : orderedRows;

    const meta = {
      from: formatDateOnly(fromDate),
      to: formatDateOnly(toDate),
      ...(params.centerId ? { centerId: params.centerId } : {}),
    };

    return NextResponse.json({ meta, rows: limitedRows });
  } catch (error) {
    if (error instanceof ZodError) {
      return buildReportError(400, "ValidationError", "Invalid query params", {
        issues: error.issues,
      });
    }
    console.error("GET /api/reports/student-activity failed", error);
    return buildReportError(500, "InternalError", "Internal server error");
  }
}
