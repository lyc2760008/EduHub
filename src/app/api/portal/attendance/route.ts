// Parent portal attendance endpoint with tenant + linked student scoping.
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  assertParentLinkedToStudent,
  buildPortalError,
  getLinkedStudentIds,
  parsePortalPagination,
  requirePortalParent,
  resolvePortalRange,
} from "@/lib/portal/parent";

export const runtime = "nodejs";

const RANGE_CONFIG = {
  defaultFromOffsetDays: -30,
  defaultToOffsetDays: 0,
  maxRangeDays: 365,
};

export async function GET(req: NextRequest) {
  try {
    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const studentIdParam = url.searchParams.get("studentId")?.trim() || undefined;

    const rangeResult = resolvePortalRange(
      url.searchParams.get("from"),
      url.searchParams.get("to"),
      RANGE_CONFIG,
    );
    if (rangeResult instanceof Response) return rangeResult;
    const { from, to } = rangeResult;

    const { take, skip } = parsePortalPagination(req, {
      take: 50,
      maxTake: 200,
      skip: 0,
    });

    let allowedStudentIds: string[] = [];

    if (studentIdParam) {
      const linkError = await assertParentLinkedToStudent(
        tenantId,
        ctx.parentId,
        studentIdParam,
      );
      if (linkError) return linkError;
      allowedStudentIds = [studentIdParam];
    } else {
      // Allow cross-student queries for the portal, but keep strict paging + range limits.
      allowedStudentIds = await getLinkedStudentIds(tenantId, ctx.parentId);
    }

    if (allowedStudentIds.length === 0) {
      return NextResponse.json({
        range: { from: from.toISOString(), to: to.toISOString() },
        countsByStatus: {},
        items: [],
        take,
        skip,
      });
    }

    const where = {
      tenantId,
      studentId: { in: allowedStudentIds },
      session: { startAt: { gte: from, lte: to } },
    };

    const [attendanceRows, groupedCounts] = await Promise.all([
      prisma.attendance.findMany({
        where,
        orderBy: [
          { session: { startAt: "desc" } },
          { student: { lastName: "asc" } },
          { student: { firstName: "asc" } },
        ],
        skip,
        take,
        select: {
          // Portal-safe attendance fields only (exclude staff-only notes).
          id: true,
          studentId: true,
          sessionId: true,
          status: true,
          parentVisibleNote: true,
          session: {
            select: {
              startAt: true,
              endAt: true,
              sessionType: true,
              groupId: true,
              group: { select: { name: true } },
            },
          },
        },
      }),
      prisma.attendance.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

    const countsByStatus = groupedCounts.reduce<Record<string, number>>(
      (acc, entry) => {
        acc[entry.status] = entry._count._all;
        return acc;
      },
      {},
    );

    const items = attendanceRows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      sessionId: row.sessionId,
      dateTime: row.session.startAt.toISOString(),
      status: row.status,
      parentVisibleNote: row.parentVisibleNote ?? null,
      sessionType: row.session.sessionType,
      sessionEndAt: row.session.endAt ? row.session.endAt.toISOString() : null,
      groupId: row.session.groupId,
      groupName: row.session.group?.name ?? null,
    }));

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      countsByStatus,
      items,
      take,
      skip,
    });
  } catch (error) {
    console.error("GET /api/portal/attendance failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
