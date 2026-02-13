/**
 * @state.route /api/sessions/generate
 * @state.area api
 * @state.capabilities create:generate
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Commit endpoint for planned session generation (preview uses the shared planner in a sibling route).
import { NextRequest, NextResponse } from "next/server";

import { Prisma, type Role, AuditActorType } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { toAuditErrorCode } from "@/lib/audit/errorCode";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  GeneratePlanError,
  GenerateSessionsInputSchema,
  planGenerateSessions,
} from "@/lib/sessions/generate/planGenerateSessions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const CREATED_ID_LIMIT = 10;

export async function POST(req: NextRequest) {
  let tenantId: string | null = null;
  let actorId: string | null = null;
  let actorDisplay: string | null = null;
  let entityIdentifier: string | null = null;
  try {
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const scopedTenantId = ctx.tenant.tenantId;
    tenantId = scopedTenantId;
    actorId = ctx.user.id;
    actorDisplay = ctx.user.name ?? null;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = GenerateSessionsInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    entityIdentifier = parsed.data.groupId ?? parsed.data.centerId;

    const plan = await planGenerateSessions({
      tenantId: scopedTenantId,
      actorId: ctx.user.id,
      data: parsed.data,
    });

    const createdIds: string[] = [];
    let createdCount = 0;
    let driftDuplicateCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const sessionPlan of plan._plan.sessionsToCreate) {
        try {
          const session = await tx.session.create({
            data: sessionPlan.data,
            select: { id: true },
          });

          createdCount += 1;
          if (createdIds.length < CREATED_ID_LIMIT) {
            createdIds.push(session.id);
          }

          if (sessionPlan.rosterStudentIds.length) {
            await tx.sessionStudent.createMany({
              data: sessionPlan.rosterStudentIds.map((studentId) => ({
                tenantId: scopedTenantId,
                sessionId: session.id,
                studentId,
              })),
              skipDuplicates: true,
            });
          }
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            // Handle commit-time drift safely when another request creates the same slot first.
            driftDuplicateCount += 1;
            continue;
          }
          throw error;
        }
      }
    });

    const skippedDuplicateCount =
      plan.wouldSkipDuplicateCount + driftDuplicateCount;

    await writeAuditEvent({
      tenantId: scopedTenantId,
      actorType: AuditActorType.USER,
      actorId,
      actorDisplay,
      action: AUDIT_ACTIONS.SESSIONS_GENERATED,
      entityType: AUDIT_ENTITY_TYPES.SESSION,
      entityId: entityIdentifier,
      result: "SUCCESS",
      metadata: {
        sessionsCreatedCount: createdCount,
        sessionsUpdatedCount: 0,
        sessionsSkippedCount: skippedDuplicateCount + plan.wouldConflictCount,
        inputRangeFrom: parsed.data.startDate,
        inputRangeTo: parsed.data.endDate,
      },
      request: req,
    });

    return NextResponse.json({
      createdCount,
      skippedDuplicateCount,
      conflictCount: plan.wouldConflictCount,
      range: {
        from: plan.range.from.toISOString(),
        to: plan.range.to.toISOString(),
      },
      createdSampleIds: createdIds,
    });
  } catch (error) {
    if (tenantId) {
      await writeAuditEvent({
        tenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.SESSIONS_GENERATED,
        entityType: AUDIT_ENTITY_TYPES.SESSION,
        entityId: entityIdentifier,
        result: "FAILURE",
        metadata: {
          errorCode: toAuditErrorCode(error),
        },
        request: req,
      });
    }

    if (error instanceof GeneratePlanError) {
      return NextResponse.json(
        { error: "ValidationError", details: error.details },
        { status: error.status },
      );
    }

    console.error("POST /api/sessions/generate failed", error);
    return jsonError(500, "Internal server error");
  }
}
