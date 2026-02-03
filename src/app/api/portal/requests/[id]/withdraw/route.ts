// Parent portal endpoint for withdrawing pending requests before session start.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { RequestStatus } from "@/generated/prisma/client";
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
      return buildPortalError(400, "ValidationError", "Invalid request id", {
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
      return buildPortalError(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
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
      },
    });

    if (!request || request.parentId !== ctx.parentId) {
      // Return 404 to avoid leaking existence across parents or tenants.
      return buildPortalError(404, "NotFound", "Request not found");
    }

    if (request.status !== RequestStatus.PENDING) {
      return buildPortalError(409, "Conflict", "Request cannot be withdrawn", {
        reason: "PORTAL_REQUEST_STATUS_INVALID",
        status: request.status,
      });
    }

    const session = await prisma.session.findFirst({
      where: { id: request.sessionId, tenantId },
      select: { startAt: true },
    });

    if (!session) {
      return buildPortalError(404, "NotFound", "Session not found");
    }

    const now = new Date();
    if (session.startAt <= now) {
      return buildPortalError(409, "Conflict", "Session has already started", {
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
      return buildPortalError(409, "Conflict", "Request cannot be withdrawn", {
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
      return buildPortalError(404, "NotFound", "Request not found");
    }

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("POST /api/portal/requests/[id]/withdraw failed", error);
    return buildPortalError(500, "InternalError", "Internal server error");
  }
}
