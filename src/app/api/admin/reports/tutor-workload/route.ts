import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  formatDateOnly,
  getWeekRangeFromPreset,
  type WeekPreset,
} from "@/lib/reports/adminReportUtils";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const querySchema = z
  .object({
    week: z.enum(["thisWeek", "nextWeek"]).default("thisWeek"),
    groupId: z.string().trim().min(1).optional(),
    centerId: z.string().trim().min(1).optional(),
  })
  .strict();

type WorkloadRollup = {
  tutorId: string;
  tutorName: string;
  totalSessions: number;
  totalMinutes: number;
  studentIds: Set<string>;
  groupIds: Set<string>;
  groupNames: Set<string>;
  firstSessionAt: Date | null;
  lastSessionAt: Date | null;
};

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
  const { week, groupId, centerId } = parsed.data;
  const { from, toExclusive } = getWeekRangeFromPreset(week as WeekPreset);

  const sessions = await prisma.session.findMany({
    where: {
      tenantId,
      startAt: {
        gte: from,
        lt: toExclusive,
      },
      ...(groupId ? { groupId } : {}),
      ...(centerId ? { centerId } : {}),
    },
    select: {
      id: true,
      tutorId: true,
      startAt: true,
      endAt: true,
      groupId: true,
      tutor: {
        select: {
          name: true,
          email: true,
        },
      },
      group: {
        select: {
          name: true,
        },
      },
      sessionStudents: {
        select: {
          studentId: true,
        },
      },
    },
  });

  const rollups = new Map<string, WorkloadRollup>();

  for (const session of sessions) {
    const existing = rollups.get(session.tutorId);
    const rollup: WorkloadRollup =
      existing ??
      {
        tutorId: session.tutorId,
        tutorName: session.tutor.name?.trim() || session.tutor.email,
        totalSessions: 0,
        totalMinutes: 0,
        studentIds: new Set<string>(),
        groupIds: new Set<string>(),
        groupNames: new Set<string>(),
        firstSessionAt: null,
        lastSessionAt: null,
      };

    rollup.totalSessions += 1;
    rollup.totalMinutes += Math.max(
      0,
      Math.round((session.endAt.getTime() - session.startAt.getTime()) / 60000),
    );

    for (const rosterItem of session.sessionStudents) {
      rollup.studentIds.add(rosterItem.studentId);
    }

    if (session.groupId) {
      rollup.groupIds.add(session.groupId);
      if (session.group?.name) {
        rollup.groupNames.add(session.group.name);
      }
    }

    if (!rollup.firstSessionAt || session.startAt < rollup.firstSessionAt) {
      rollup.firstSessionAt = session.startAt;
    }
    if (!rollup.lastSessionAt || session.startAt > rollup.lastSessionAt) {
      rollup.lastSessionAt = session.startAt;
    }

    rollups.set(session.tutorId, rollup);
  }

  const rows = Array.from(rollups.values()).map((rollup) => ({
    tutorId: rollup.tutorId,
    tutorName: rollup.tutorName,
    totalSessions: rollup.totalSessions,
    totalMinutes: rollup.totalMinutes,
    distinctStudents: rollup.studentIds.size,
    distinctGroups: rollup.groupIds.size,
    firstSessionAt: rollup.firstSessionAt?.toISOString() ?? null,
    lastSessionAt: rollup.lastSessionAt?.toISOString() ?? null,
    groupNames: Array.from(rollup.groupNames.values()),
  }));

  rows.sort((left, right) => {
    const minuteDiff = right.totalMinutes - left.totalMinutes;
    if (minuteDiff !== 0) return minuteDiff;
    const sessionDiff = right.totalSessions - left.totalSessions;
    if (sessionDiff !== 0) return sessionDiff;
    return left.tutorName.localeCompare(right.tutorName);
  });

  return NextResponse.json({
    meta: {
      week,
      from: formatDateOnly(from),
      to: formatDateOnly(new Date(toExclusive.getTime() - 1)),
    },
    rows,
  });
}
