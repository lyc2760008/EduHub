/**
 * @state.route /api/portal/homework
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Step 23.2 parent homework inbox endpoint with linked-student scoping.
 */
// Parent homework inbox endpoint enforces linked-student visibility and returns metadata-only rows.
import { NextRequest, NextResponse } from "next/server";

import { HomeworkStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildHomeworkSlotCounts,
  ensureHomeworkItemsForSessionStudents,
} from "@/lib/homework/core";
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
  defaultToOffsetDays: 60,
  maxRangeDays: 365,
};

function parsePortalStatusFilter(rawValue: string | null) {
  if (!rawValue?.trim()) {
    return [HomeworkStatus.ASSIGNED, HomeworkStatus.SUBMITTED];
  }

  const values = rawValue
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const allowed = new Set<HomeworkStatus>();
  if (values.includes("ALL")) {
    return [HomeworkStatus.ASSIGNED, HomeworkStatus.SUBMITTED, HomeworkStatus.REVIEWED];
  }

  for (const value of values) {
    if (value === "ASSIGNED" || value === "SUBMITTED" || value === "REVIEWED") {
      allowed.add(value);
    }
  }

  return allowed.size
    ? Array.from(allowed)
    : [HomeworkStatus.ASSIGNED, HomeworkStatus.SUBMITTED];
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;
    const url = new URL(req.url);

    const studentIdParam = url.searchParams.get("studentId")?.trim() || undefined;
    const statusFilter = parsePortalStatusFilter(url.searchParams.get("status"));
    const rangeResult = resolvePortalRange(
      url.searchParams.get("from"),
      url.searchParams.get("to"),
      RANGE_CONFIG,
    );
    if (rangeResult instanceof Response) return rangeResult;
    const { from, to } = rangeResult;
    const { take, skip } = parsePortalPagination(req, {
      take: 25,
      maxTake: 100,
      skip: 0,
    });

    let linkedStudentIds: string[];
    if (studentIdParam) {
      const linkError = await assertParentLinkedToStudent(
        tenantId,
        ctx.parentId,
        studentIdParam,
      );
      if (linkError) return linkError;
      linkedStudentIds = [studentIdParam];
    } else {
      linkedStudentIds = await getLinkedStudentIds(tenantId, ctx.parentId);
    }

    if (!linkedStudentIds.length) {
      return NextResponse.json({
        items: [],
        totalCount: 0,
        take,
        skip,
        range: { from: from.toISOString(), to: to.toISOString() },
      });
    }

    // Lazy-create ASSIGNED rows for linked students in range so inbox can surface assignment slots without pre-seeding.
    await ensureHomeworkItemsForSessionStudents({
      tenantId,
      studentIds: linkedStudentIds,
      from,
      toExclusive: to,
      maxRows: 500,
    });

    const where = {
      tenantId,
      studentId: { in: linkedStudentIds },
      status: { in: statusFilter },
      session: {
        startAt: {
          gte: from,
          lt: to,
        },
      },
    } as const;

    const [totalCount, rows] = await Promise.all([
      prisma.homeworkItem.count({ where }),
      prisma.homeworkItem.findMany({
        where,
        orderBy: [{ session: { startAt: "desc" } }, { id: "asc" }],
        skip,
        take,
        select: {
          id: true,
          studentId: true,
          sessionId: true,
          status: true,
          assignedAt: true,
          submittedAt: true,
          reviewedAt: true,
          session: {
            select: {
              startAt: true,
              timezone: true,
              group: {
                select: {
                  program: { select: { name: true } },
                },
              },
            },
          },
          files: {
            select: { slot: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      items: rows.map((row) => ({
        homeworkItemId: row.id,
        studentId: row.studentId,
        sessionId: row.sessionId,
        sessionDate: row.session.startAt.toISOString(),
        timezone: row.session.timezone,
        programLabel: row.session.group?.program?.name ?? null,
        status: row.status,
        assignedAt: row.assignedAt?.toISOString() ?? null,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        fileCounts: buildHomeworkSlotCounts(row.files),
      })),
      totalCount,
      take,
      skip,
      range: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (error) {
    console.error("GET /api/portal/homework failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
