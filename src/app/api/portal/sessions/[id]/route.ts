/**
 * @state.route /api/portal/sessions/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Parent portal session detail endpoint scoped by tenant + linked students.
import { NextRequest, NextResponse } from "next/server";

import { RequestType, StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildPortalError,
  getLinkedStudentIds,
  requirePortalParent,
} from "@/lib/portal/parent";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const sessionId = id?.trim();

    if (!sessionId) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        field: "id",
      });
    }

    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const linkedStudentIds = await getLinkedStudentIds(tenantId, ctx.parentId);
    if (!linkedStudentIds.length) {
      return buildPortalError(404, "NOT_FOUND");
    }

    // Only fetch roster rows for linked students to prevent group-session leakage.
    const rosterRows = await prisma.sessionStudent.findMany({
      where: {
        tenantId,
        sessionId,
        studentId: { in: linkedStudentIds },
      },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            level: { select: { id: true, name: true } },
          },
        },
        session: {
          select: {
            id: true,
            sessionType: true,
            startAt: true,
            endAt: true,
            timezone: true,
            groupId: true,
            group: { select: { name: true } },
            centerId: true,
            center: { select: { name: true } },
            tutor: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!rosterRows.length) {
      return buildPortalError(404, "NOT_FOUND");
    }

    const rosterStudentIds = rosterRows.map((row) => row.studentId);
    const attendanceRows = await prisma.attendance.findMany({
      where: {
        tenantId,
        sessionId,
        studentId: { in: rosterStudentIds },
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        parentVisibleNote: true,
        markedAt: true,
      },
    });

    const attendanceByStudentId = new Map(
      attendanceRows.map((row) => [
        row.studentId,
        {
          id: row.id,
          status: row.status,
          parentVisibleNote: row.parentVisibleNote ?? null,
          markedAt: row.markedAt ? row.markedAt.toISOString() : null,
        },
      ]),
    );

    const requestRows = await prisma.parentRequest.findMany({
      where: {
        tenantId,
        sessionId,
        studentId: { in: rosterStudentIds },
        type: RequestType.ABSENCE,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        studentId: true,
        type: true,
        status: true,
        createdAt: true,
        // Include updatedAt so portal UI can show last-updated timestamps.
        updatedAt: true,
        resolvedAt: true,
      },
    });

    const requestByStudentId = new Map<string, (typeof requestRows)[number]>();
    // Keep the most recent request per student by respecting the DESC ordering.
    for (const row of requestRows) {
      if (!requestByStudentId.has(row.studentId)) {
        requestByStudentId.set(row.studentId, row);
      }
    }

    const session = rosterRows[0].session;

    return NextResponse.json({
      session: {
        id: session.id,
        sessionType: session.sessionType,
        startAt: session.startAt.toISOString(),
        endAt: session.endAt ? session.endAt.toISOString() : null,
        timezone: session.timezone,
        groupId: session.groupId,
        groupName: session.group?.name ?? null,
        centerId: session.centerId,
        centerName: session.center?.name ?? null,
        tutor: session.tutor
          ? { id: session.tutor.id, name: session.tutor.name ?? null }
          : null,
      },
      students: rosterRows.map((row) => {
        const request = requestByStudentId.get(row.studentId);
        return {
          student: {
            id: row.student.id,
            firstName: row.student.firstName,
            lastName: row.student.lastName,
            isActive: row.student.status === StudentStatus.ACTIVE,
            level: row.student.level
              ? { id: row.student.level.id, name: row.student.level.name }
              : null,
          },
          attendance: attendanceByStudentId.get(row.studentId) ?? null,
          // Per-student request status is safe to expose for linked roster entries only.
          request: request
            ? {
                id: request.id,
                type: request.type,
                status: request.status,
                createdAt: request.createdAt.toISOString(),
                updatedAt: request.updatedAt.toISOString(),
                resolvedAt: request.resolvedAt
                  ? request.resolvedAt.toISOString()
                  : null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/portal/sessions/[id] failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
