/**
 * @state.route /api/groups/[id]/sync-future-sessions
 * @state.area api
 * @state.capabilities create:sync_future_session
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Sync-group-roster API that backfills missing students into future sessions for the same group.
import { NextRequest, NextResponse } from "next/server";

import {
  AuditActorType,
  type Role,
} from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { toAuditErrorCode } from "@/lib/audit/errorCode";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
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
  let tenantId: string | null = null;
  let actorId: string | null = null;
  let actorDisplay: string | null = null;
  let groupId: string | null = null;
  try {
    const { id } = await context.params;
    groupId = id;

    // Reuse admin RBAC gate so only Owner/Admin can trigger roster sync.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    tenantId = ctx.tenant.tenantId;
    actorId = ctx.user.id;
    actorDisplay = ctx.user.name ?? null;

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
      await writeAuditEvent({
        tenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED,
        entityType: AUDIT_ENTITY_TYPES.GROUP,
        entityId: group.id,
        result: "SUCCESS",
        metadata: {
          sessionsAffectedCount: 0,
          studentsAddedCount: 0,
          totalFutureSessions: futureSessionIds.length,
        },
        request: req,
      });

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

    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId,
      actorDisplay,
      action: AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED,
      entityType: AUDIT_ENTITY_TYPES.GROUP,
      entityId: group.id,
      result: "SUCCESS",
      metadata: {
        sessionsAffectedCount: touchedSessionIds.size,
        studentsAddedCount: rowsToCreate.length,
        totalFutureSessions: futureSessionIds.length,
      },
      request: req,
    });

    return NextResponse.json({
      totalFutureSessions: futureSessionIds.length,
      sessionsUpdated: touchedSessionIds.size,
      studentsAdded: rowsToCreate.length,
    });
  } catch (error) {
    if (tenantId) {
      await writeAuditEvent({
        tenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.GROUP_FUTURE_SESSIONS_SYNCED,
        entityType: AUDIT_ENTITY_TYPES.GROUP,
        entityId: groupId,
        result: "FAILURE",
        metadata: {
          errorCode: toAuditErrorCode(error),
        },
        request: req,
      });
    }
    console.error("POST /api/groups/[id]/sync-future-sessions failed", error);
    return jsonError(500, "Internal server error");
  }
}
