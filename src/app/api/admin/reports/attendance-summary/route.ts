import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  formatDateOnly,
  formatDisplayName,
  getPastRangeFromPreset,
  mapStatusFilterToStudentStatuses,
  type ActiveInactiveAll,
} from "@/lib/reports/adminReportUtils";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const querySchema = z
  .object({
    preset: z.enum(["7d", "30d", "60d", "90d"]).default("30d"),
    groupId: z.string().trim().min(1).optional(),
    tutorId: z.string().trim().min(1).optional(),
    studentStatus: z.enum(["ACTIVE", "INACTIVE", "ALL"]).default("ALL"),
  })
  .strict();

type StudentRollup = {
  studentId: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedAbsentCount: number;
  groupCounts: Map<string, number>;
};

function buildProgramLevel(
  programName: string | null,
  levelName: string | null,
): string | null {
  if (programName && levelName) return `${programName} / ${levelName}`;
  return programName ?? levelName ?? null;
}

function getPrimaryGroupId(groupCounts: Map<string, number>) {
  const entries = Array.from(groupCounts.entries());
  if (!entries.length) return null;
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries[0]?.[0] ?? null;
}

export async function GET(req: NextRequest) {
  const ctx = await requireRole(req, ADMIN_ROLES);
  if (ctx instanceof Response) return ctx;

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ValidationError", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const tenantId = ctx.tenant.tenantId;
  const { preset, groupId, tutorId, studentStatus } = parsed.data;
  const { from, toExclusive } = getPastRangeFromPreset(
    preset as Parameters<typeof getPastRangeFromPreset>[0],
  );

  const sessions = await prisma.session.findMany({
    where: {
      tenantId,
      startAt: {
        gte: from,
        lt: toExclusive,
      },
      ...(groupId ? { groupId } : {}),
      ...(tutorId ? { tutorId } : {}),
    },
    select: {
      id: true,
      groupId: true,
      group: {
        select: {
          id: true,
          name: true,
          program: { select: { name: true } },
          level: { select: { name: true } },
        },
      },
    },
  });

  const sessionIds = sessions.map((session) => session.id);

  if (!sessionIds.length) {
    return NextResponse.json({
      meta: {
        preset,
        from: formatDateOnly(from),
        to: formatDateOnly(new Date(toExclusive.getTime() - 1)),
      },
      rows: [],
    });
  }

  const [sessionStudents, attendances] = await Promise.all([
    prisma.sessionStudent.findMany({
      where: {
        tenantId,
        sessionId: { in: sessionIds },
      },
      select: {
        studentId: true,
        sessionId: true,
      },
    }),
    prisma.attendance.findMany({
      where: {
        tenantId,
        sessionId: { in: sessionIds },
      },
      select: {
        studentId: true,
        sessionId: true,
        status: true,
      },
    }),
  ]);

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const rollups = new Map<string, StudentRollup>();

  const getRollup = (studentId: string) => {
    const existing = rollups.get(studentId);
    if (existing) return existing;
    const created: StudentRollup = {
      studentId,
      totalSessions: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedAbsentCount: 0,
      groupCounts: new Map(),
    };
    rollups.set(studentId, created);
    return created;
  };

  for (const row of sessionStudents) {
    const rollup = getRollup(row.studentId);
    rollup.totalSessions += 1;
    const session = sessionById.get(row.sessionId);
    if (session?.groupId) {
      rollup.groupCounts.set(
        session.groupId,
        (rollup.groupCounts.get(session.groupId) ?? 0) + 1,
      );
    }
  }

  for (const row of attendances) {
    const rollup = getRollup(row.studentId);
    if (row.status === "PRESENT") rollup.presentCount += 1;
    if (row.status === "ABSENT") rollup.absentCount += 1;
    if (row.status === "LATE") rollup.lateCount += 1;
    if (row.status === "EXCUSED") rollup.excusedAbsentCount += 1;
  }

  const statusFilter = mapStatusFilterToStudentStatuses(
    studentStatus as ActiveInactiveAll,
  );
  const studentIds = Array.from(rollups.keys());
  const students = await prisma.student.findMany({
    where: {
      tenantId,
      id: { in: studentIds },
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      status: true,
      level: { select: { name: true } },
    },
  });

  const groupLookup = new Map(
    sessions
      .filter((session) => session.group)
      .map((session) => [
        session.group!.id,
        {
          name: session.group!.name,
          programName: session.group!.program.name,
          levelName: session.group!.level?.name ?? null,
        },
      ]),
  );

  const rows = students.map((student) => {
    const rollup = rollups.get(student.id);
    const primaryGroupId = rollup ? getPrimaryGroupId(rollup.groupCounts) : null;
    const primaryGroup = primaryGroupId ? groupLookup.get(primaryGroupId) : null;
    const programLevel =
      buildProgramLevel(
        primaryGroup?.programName ?? null,
        primaryGroup?.levelName ?? student.level?.name ?? null,
      ) ?? null;
    const totalSessions = rollup?.totalSessions ?? 0;
    const absentCount = rollup?.absentCount ?? 0;
    const absenceRatePercent =
      totalSessions > 0 ? (absentCount / totalSessions) * 100 : 0;

    return {
      studentId: student.id,
      studentName: formatDisplayName(
        student.firstName,
        student.lastName,
        student.preferredName,
      ),
      programLevel,
      groupName: primaryGroup?.name ?? null,
      totalSessions,
      presentCount: rollup?.presentCount ?? 0,
      absentCount,
      lateCount: rollup?.lateCount ?? 0,
      excusedAbsentCount: rollup?.excusedAbsentCount ?? 0,
      absenceRatePercent,
      studentStatus: student.status,
    };
  });

  rows.sort((left, right) => {
    const rateDiff = right.absenceRatePercent - left.absenceRatePercent;
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = right.totalSessions - left.totalSessions;
    if (totalDiff !== 0) return totalDiff;
    return left.studentName.localeCompare(right.studentName);
  });

  return NextResponse.json({
    meta: {
      preset,
      from: formatDateOnly(from),
      to: formatDateOnly(new Date(toExclusive.getTime() - 1)),
    },
    rows,
  });
}
