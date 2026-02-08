import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  formatDateOnly,
  formatDisplayName,
  getUpcomingRangeFromPreset,
  type DateRangePreset,
} from "@/lib/reports/adminReportUtils";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const querySchema = z
  .object({
    preset: z.enum(["today", "7d", "14d", "30d"]).default("14d"),
    tutorId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
    studentId: z.string().trim().min(1).optional(),
  })
  .strict();

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
  const { preset, tutorId, groupId, studentId } = parsed.data;

  const { from, toExclusive } = getUpcomingRangeFromPreset(preset as DateRangePreset);

  const sessions = await prisma.session.findMany({
    where: {
      tenantId,
      startAt: {
        gte: from,
        lt: toExclusive,
      },
      ...(tutorId ? { tutorId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(studentId
        ? {
            sessionStudents: {
              some: {
                studentId,
              },
            },
          }
        : {}),
    },
    orderBy: [{ startAt: "asc" }, { endAt: "asc" }],
    select: {
      id: true,
      startAt: true,
      endAt: true,
      sessionType: true,
      center: { select: { name: true } },
      group: { select: { id: true, name: true } },
      tutor: { select: { name: true, email: true } },
      sessionStudents: {
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      },
    },
  });

  const rows = sessions.map((session) => ({
    sessionId: session.id,
    sessionDate: formatDateOnly(session.startAt),
    startAt: session.startAt.toISOString(),
    durationMinutes: Math.max(
      0,
      Math.round((session.endAt.getTime() - session.startAt.getTime()) / 60000),
    ),
    sessionType: session.sessionType,
    groupId: session.group?.id ?? null,
    groupName: session.group?.name ?? null,
    studentNames: session.sessionStudents.map((item) =>
      formatDisplayName(
        item.student.firstName,
        item.student.lastName,
        item.student.preferredName,
      ),
    ),
    tutorName: session.tutor.name?.trim() || session.tutor.email,
    centerName: session.center.name,
  }));

  return NextResponse.json({
    meta: {
      preset,
      from: formatDateOnly(from),
      to: formatDateOnly(new Date(toExclusive.getTime() - 1)),
    },
    rows,
  });
}
