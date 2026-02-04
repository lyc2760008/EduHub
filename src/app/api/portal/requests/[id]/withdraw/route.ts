// Parent portal endpoint for withdrawing pending requests before session start.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AuditActorType, RequestStatus } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { buildPortalError, requirePortalParent } from "@/lib/portal/parent";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const WithdrawRequestSchema = z.object({}).strict();

export async function POST(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;
    const requestId = id?.trim();

    if (!requestId) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        field: "id",
        reason: "PORTAL_REQUEST_INVALID",
      });
    }

    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // Empty bodies are allowed for withdraw; validate against an empty object.
      body = {};
    }

    const parsed = WithdrawRequestSchema.safeParse(body);
    if (!parsed.success) {
      return buildPortalError(400, "VALIDATION_ERROR", {
        reason: "PORTAL_REQUEST_INVALID",
      });
    }

    const request = await prisma.parentRequest.findFirst({
      where: { id: requestId, tenantId },
      select: {
        id: true,
        parentId: true,
        status: true,
        sessionId: true,
        studentId: true,
        reasonCode: true,
        message: true,
      },
    });

    if (!request || request.parentId !== ctx.parentId) {
      // Return 404 to avoid leaking existence across parents or tenants.
      return buildPortalError(404, "NOT_FOUND");
    }

    if (request.status !== RequestStatus.PENDING) {
      return buildPortalError(409, "CONFLICT", {
        reason: "PORTAL_REQUEST_STATUS_INVALID",
        status: request.status,
      });
    }

    const session = await prisma.session.findFirst({
      where: { id: request.sessionId, tenantId },
      select: { startAt: true },
    });

    if (!session) {
      return buildPortalError(404, "NOT_FOUND");
    }

    const now = new Date();
    if (session.startAt <= now) {
      return buildPortalError(409, "CONFLICT", {
        reason: "PORTAL_REQUEST_NOT_ALLOWED",
        rule: "SESSION_NOT_UPCOMING",
      });
    }

    // Update the existing request record to avoid duplicates per session/student.
    const updateResult = await prisma.parentRequest.updateMany({
      where: {
        id: request.id,
        tenantId,
        parentId: ctx.parentId,
        status: RequestStatus.PENDING,
      },
      data: {
        status: RequestStatus.WITHDRAWN,
        withdrawnAt: now,
        withdrawnByParentId: ctx.parentId,
      },
    });

    if (updateResult.count === 0) {
      return buildPortalError(409, "CONFLICT", {
        reason: "PORTAL_REQUEST_STATUS_INVALID",
      });
    }

    const updated = await prisma.parentRequest.findFirst({
      where: { id: request.id, tenantId },
      select: {
        id: true,
        type: true,
        status: true,
        reasonCode: true,
        message: true,
        sessionId: true,
        studentId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
      },
    });

    if (!updated) {
      return buildPortalError(404, "NOT_FOUND");
    }

    // Audit the withdraw action without persisting the request message content.
    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.PARENT,
      actorId: ctx.parentId,
      actorDisplay: ctx.parent.email,
      action: AUDIT_ACTIONS.ABSENCE_REQUEST_WITHDRAWN,
      entityType: AUDIT_ENTITY_TYPES.REQUEST,
      entityId: updated.id,
      metadata: {
        sessionId: updated.sessionId,
        studentId: updated.studentId,
        reasonCode: updated.reasonCode,
        messageLength: updated.message ? updated.message.length : 0,
        fromStatus: RequestStatus.PENDING,
        toStatus: updated.status,
      },
      request: req,
    });

    return NextResponse.json({
      request: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("POST /api/portal/requests/[id]/withdraw failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
