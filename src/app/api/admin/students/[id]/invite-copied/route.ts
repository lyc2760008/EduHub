// Admin endpoint to audit invite-copy actions without persisting invite content.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { AuditActorType, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

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

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const InviteCopiedSchema = z
  .object({
    parentId: z.string().min(1),
  })
  .strict();

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape keeps admin invite-copy handling predictable.
  return jsonError(status, message, { error: { code, message, details } });
}

async function normalizeAuthResponse(response: Response) {
  // Normalize auth/tenant errors into the standard error shape.
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
    // Fallback keeps non-JSON auth errors from breaking callers.
  }

  return buildErrorResponse(status, code, message, details);
}

export async function POST(req: NextRequest, context: Params) {
  try {
    const { id: studentId } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return buildErrorResponse(400, "ValidationError", "Invalid JSON body", {
        message: "Invalid JSON body",
      });
    }

    const parsed = InviteCopiedSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const parentId = parsed.data.parentId;

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) {
      return buildErrorResponse(404, "NotFound", "Student not found");
    }

    const parent = await prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      return buildErrorResponse(404, "NotFound", "Parent not found");
    }

    const link = await prisma.studentParent.findFirst({
      where: { tenantId, studentId, parentId },
      select: { id: true },
    });
    if (!link) {
      // Return 404 to avoid leaking parent/student relationships across tenants.
      return buildErrorResponse(404, "NotFound", "Parent link not found");
    }

    // Audit copy events explicitly so invite-data fetches don't imply a copy action.
    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.email ?? ctx.user.name ?? null,
      action: AUDIT_ACTIONS.PARENT_INVITE_COPIED,
      entityType: AUDIT_ENTITY_TYPES.STUDENT,
      entityId: student.id,
      metadata: {
        parentId: parent.id,
        studentId: student.id,
      },
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/students/[id]/invite-copied failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
