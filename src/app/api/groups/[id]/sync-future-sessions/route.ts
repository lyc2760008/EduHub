/**
 * @state.route /api/groups/[id]/sync-future-sessions
 * @state.area api
 * @state.capabilities create:sync_future_session
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Sync-group-roster API that backfills missing students into future sessions for the same group.
import { NextRequest, NextResponse } from "next/server";

import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getGroupCoreForTenant } from "@/lib/groups/data";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type SessionStudentEdge = {
  sessionId: string;
  studentId: string;
};

export async function POST(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // Reuse admin RBAC gate so only Owner/Admin can trigger roster sync.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const group = await getGroupCoreForTenant(prisma, tenantId, id);
    if (!group) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const now = new Date();
    const [groupStudents, futureSessions] = await Promise.all([
      prisma.groupStudent.findMany({
        where: { tenantId, groupId: group.id },
        select: { studentId: true },
      }),
      prisma.session.findMany({
        where: {
          tenantId,
          groupId: group.id,
          startAt: { gt: now },
        },
        select: { id: true },
      }),
    ]);

    const groupStudentIds = groupStudents.map((entry) => entry.studentId);
    const futureSessionIds = futureSessions.map((session) => session.id);

    if (!groupStudentIds.length || !futureSessionIds.length) {
      return NextResponse.json({
        totalFutureSessions: futureSessionIds.length,
        sessionsUpdated: 0,
        studentsAdded: 0,
      });
    }

    const existingEdges = await prisma.sessionStudent.findMany({
      where: { tenantId, sessionId: { in: futureSessionIds } },
      select: { sessionId: true, studentId: true },
    });

    // Build a fast lookup so we only insert missing rows and keep sync idempotent.
    const existingEdgeSet = new Set(
      existingEdges.map((edge: SessionStudentEdge) => `${edge.sessionId}:${edge.studentId}`),
    );

    const rowsToCreate: Array<{
      tenantId: string;
      sessionId: string;
      studentId: string;
    }> = [];
    const touchedSessionIds = new Set<string>();

    for (const sessionId of futureSessionIds) {
      for (const studentId of groupStudentIds) {
        const key = `${sessionId}:${studentId}`;
        if (existingEdgeSet.has(key)) continue;
        rowsToCreate.push({ tenantId, sessionId, studentId });
        touchedSessionIds.add(sessionId);
      }
    }

    if (rowsToCreate.length) {
      await prisma.sessionStudent.createMany({
        data: rowsToCreate,
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      totalFutureSessions: futureSessionIds.length,
      sessionsUpdated: touchedSessionIds.size,
      studentsAdded: rowsToCreate.length,
    });
  } catch (error) {
    console.error("POST /api/groups/[id]/sync-future-sessions failed", error);
    return jsonError(500, "Internal server error");
  }
}
