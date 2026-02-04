// Parent portal endpoint for resubmitting withdrawn requests before session start.
import { NextRequest, NextResponse } from "next/server";

import { RequestStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildPortalError, requirePortalParent } from "@/lib/portal/parent";
import { resubmitParentRequestSchema } from "@/lib/validation/parentRequest";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return buildPortalError(400, "VALIDATION_ERROR", {
        reason: "PORTAL_REQUEST_INVALID",
      });
    }

    const parsed = resubmitParentRequestSchema.safeParse(body);
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
      },
    });

    if (!request || request.parentId !== ctx.parentId) {
      // Return 404 to avoid leaking existence across parents or tenants.
      return buildPortalError(404, "NOT_FOUND");
    }

    if (request.status !== RequestStatus.WITHDRAWN) {
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

    const data = parsed.data;

    // Resubmission reuses the existing request record (no duplicates per session/student).
    const updateResult = await prisma.parentRequest.updateMany({
      where: {
        id: request.id,
        tenantId,
        parentId: ctx.parentId,
        status: RequestStatus.WITHDRAWN,
      },
      data: {
        status: RequestStatus.PENDING,
        reasonCode: data.reasonCode,
        message: data.message ?? null,
        resubmittedAt: now,
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

    return NextResponse.json({
      request: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      },
    });
  } catch (error) {
    console.error("POST /api/portal/requests/[id]/resubmit failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
