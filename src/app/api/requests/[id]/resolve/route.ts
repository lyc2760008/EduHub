// Admin request resolution endpoint with tenant scoping and RBAC enforcement.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  AuditActorType,
  RequestStatus,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type Params = {
  params: Promise<{ id: string }>;
};

type ErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

const ResolveRequestSchema = z
  .object({
    status: z.enum([RequestStatus.APPROVED, RequestStatus.DECLINED]),
  })
  .strict();

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for admin request endpoints.
  return jsonError(status, message, { error: { code, message, details } });
}

async function normalizeAuthResponse(response: Response) {
  // Convert auth/tenant errors into the standard error response shape.
  const status = response.status;
  const code: ErrorCode =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";
  const fallbackMessage =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";
  let message = fallbackMessage;
  let details: Record<string, unknown> = {};

  try {
    const payload = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
      details?: unknown;
    };
    if (typeof payload?.error === "string") {
      message = payload.error;
    } else if (typeof payload?.message === "string") {
      message = payload.message;
    }
    if (payload?.details) {
      details =
        typeof payload.details === "string"
          ? { message: payload.details }
          : (payload.details as Record<string, unknown>);
    }
  } catch {
    // Fall back to default message when response bodies are not JSON.
  }

  return buildErrorResponse(status, code, message, details);
}

export async function POST(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return buildErrorResponse(400, "ValidationError", "Invalid JSON body", {
        field: "body",
      });
    }

    const parsed = ResolveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const resolvedAt = new Date();
    const updateResult = await prisma.parentRequest.updateMany({
      where: { id, tenantId, status: RequestStatus.PENDING },
      data: {
        status: parsed.data.status,
        resolvedAt,
        resolvedByUserId: ctx.user.id,
      },
    });

    if (updateResult.count === 0) {
      const existing = await prisma.parentRequest.findFirst({
        where: { id, tenantId },
        select: { status: true },
      });
      if (!existing) {
        return buildErrorResponse(404, "NotFound", "Request not found");
      }
      // Withdrawn requests are parent-controlled and must not be resolved by staff.
      if (existing.status === RequestStatus.WITHDRAWN) {
        return buildErrorResponse(409, "Conflict", "Request is withdrawn", {
          reason: "REQUEST_WITHDRAWN_NOT_RESOLVABLE",
        });
      }
      return buildErrorResponse(409, "Conflict", "Request already resolved", {
        status: existing.status,
      });
    }

    const updated = await prisma.parentRequest.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        type: true,
        status: true,
        reasonCode: true,
        message: true,
        sessionId: true,
        studentId: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        resolvedByUserId: true,
      },
    });

    if (!updated) {
      return buildErrorResponse(404, "NotFound", "Request not found");
    }

    // Audit resolution without persisting message content.
    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.email ?? ctx.user.name ?? null,
      action: AUDIT_ACTIONS.ABSENCE_REQUEST_RESOLVED,
      entityType: AUDIT_ENTITY_TYPES.REQUEST,
      entityId: updated.id,
      metadata: {
        sessionId: updated.sessionId,
        studentId: updated.studentId,
        reasonCode: updated.reasonCode,
        messageLength: updated.message ? updated.message.length : 0,
        fromStatus: RequestStatus.PENDING,
        toStatus: updated.status,
        resolvedStatus: updated.status,
      },
      request: req,
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("POST /api/requests/[id]/resolve failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
