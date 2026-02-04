// Parent portal sessions endpoint scoped by tenant + linked students.
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
  defaultFromOffsetDays: 0,
  defaultToOffsetDays: 7,
  maxRangeDays: 90,
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
      maxTake: 100,
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
      allowedStudentIds = await getLinkedStudentIds(tenantId, ctx.parentId);
    }

    if (allowedStudentIds.length === 0) {
      return NextResponse.json({
        range: { from: from.toISOString(), to: to.toISOString() },
        items: [],
        take,
        skip,
      });
    }

    const rows = await prisma.sessionStudent.findMany({
      where: {
        tenantId,
        studentId: { in: allowedStudentIds },
        session: { startAt: { gte: from, lte: to } },
      },
      orderBy: [
        { session: { startAt: "asc" } },
        { student: { lastName: "asc" } },
        { student: { firstName: "asc" } },
      ],
      skip,
      take,
      select: {
        studentId: true,
        session: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            sessionType: true,
            timezone: true,
            groupId: true,
            group: { select: { name: true } },
          },
        },
      },
    });

    const items = rows.map((row) => ({
      id: row.session.id,
      studentId: row.studentId,
      startAt: row.session.startAt.toISOString(),
      endAt: row.session.endAt ? row.session.endAt.toISOString() : null,
      sessionType: row.session.sessionType,
      timezone: row.session.timezone,
      groupId: row.session.groupId,
      groupName: row.session.group?.name ?? null,
    }));

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      items,
      take,
      skip,
    });
  } catch (error) {
    console.error("GET /api/portal/sessions failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
