/**
 * @state.route /api/parents/[parentId]/send-magic-link
 * @state.area api
 * @state.capabilities create:send_magic_link, parent_invite:send_signin_link
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Admin endpoint to send parent magic links (RBAC + tenant-safe).
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/auth/magicLink";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { toAuditErrorCode } from "@/lib/audit/errorCode";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { sendParentMagicLink } from "@/lib/auth/parentMagicLink";
import { prisma } from "@/lib/db/prisma";
import { logError } from "@/lib/observability/logger";
import { requireRole } from "@/lib/rbac";
import { AuditActorType, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const RATE_LIMIT_KIND = "PARENT_MAGIC_LINK_REQUEST";

const SendMagicLinkSchema = z
  .object({
    rememberMe: z.boolean().optional(),
    studentId: z.string().trim().min(1).optional(),
  })
  .strict();

type Params = {
  params: Promise<{ parentId: string }>;
};

type ErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for admin callers.
  return NextResponse.json(
    { error: { code, message, details } },
    { status },
  );
}

async function normalizeAuthResponse(response: Response) {
  // Normalize auth/tenant failures into the standard error response shape.
  const status = response.status;
  const code: ErrorCode =
    status === 401
      ? "Unauthorized"
      : status === 403
      ? "Forbidden"
      : status === 404
        ? "NotFound"
        : "ValidationError";
  const message =
    status === 401
      ? "Unauthorized"
      : status === 403
      ? "Forbidden"
      : status === 404
        ? "NotFound"
        : "ValidationError";

  const reason =
    status === 404 ? "NOT_FOUND" : status === 400 ? "UNKNOWN" : "UNAUTHORIZED";

  return buildErrorResponse(status, code, message, {
    reason,
  });
}

export async function POST(req: NextRequest, context: Params) {
  let parentId: string | null = null;
  let tenantId: string | null = null;
  let studentId: string | null = null;
  let actorId: string | null = null;
  let actorDisplay: string | null = null;
  try {
    const params = await context.params;
    const resolvedParentId = params.parentId;
    parentId = resolvedParentId;

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const resolvedTenantId = ctx.tenant.tenantId;
    tenantId = resolvedTenantId;
    actorId = ctx.user.id;
    actorDisplay = ctx.user.name ?? null;

    let body: unknown = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return buildErrorResponse(400, "ValidationError", "Invalid JSON body", {
        message: "Invalid JSON body",
        reason: "UNKNOWN",
      });
    }

    const parsed = SendMagicLinkSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
        reason: "UNKNOWN",
      });
    }

    studentId = parsed.data.studentId ?? null;

    if (studentId) {
      const student = await prisma.student.findFirst({
        where: { id: studentId, tenantId: resolvedTenantId },
        select: { id: true },
      });
      if (!student) {
        return buildErrorResponse(404, "NotFound", "Student not found", {
          reason: "NOT_FOUND",
        });
      }
    }

    const parent = await prisma.parent.findFirst({
      where: { id: resolvedParentId, tenantId: resolvedTenantId },
      select: { id: true, email: true },
    });

    if (!parent) {
      return buildErrorResponse(404, "NotFound", "Parent not found", {
        reason: "NOT_FOUND",
      });
    }

    const normalizedEmail = normalizeEmail(parent.email ?? "");
    if (!normalizedEmail) {
      return buildErrorResponse(400, "ValidationError", "Parent email missing", {
        reason: "MISSING_EMAIL",
      });
    }

    const hasAnyLink = await prisma.studentParent.findFirst({
      where: { tenantId: resolvedTenantId, parentId: parent.id },
      select: { id: true },
    });

    if (!hasAnyLink) {
      return buildErrorResponse(404, "NotFound", "Parent not linked", {
        reason: "NOT_ELIGIBLE",
      });
    }

    if (studentId) {
      const linkedToStudent = await prisma.studentParent.findFirst({
        where: { tenantId: resolvedTenantId, parentId: parent.id, studentId },
        select: { id: true },
      });
      if (!linkedToStudent) {
        return buildErrorResponse(404, "NotFound", "Parent not linked", {
          reason: "NOT_LINKED",
        });
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: resolvedTenantId },
      select: { id: true, slug: true, name: true, supportEmail: true },
    });

    if (!tenant) {
      return buildErrorResponse(404, "NotFound", "Tenant not found", {
        reason: "NOT_FOUND",
      });
    }

    const rememberMe = parsed.data.rememberMe ?? true;

    // Send via the shared helper to keep rate limiting + token issuance consistent.
    const sendResult = await sendParentMagicLink({
      tenant,
      parent: { id: parent.id, email: parent.email },
      rememberMe,
      initiatedBy: "admin",
      request: req,
      studentContextId: studentId,
      rateLimit: {
        kind: RATE_LIMIT_KIND,
        tenantId: tenant.id,
      },
    });

    if (!sendResult.ok) {
      await writeAuditEvent({
        tenantId: resolvedTenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.PARENT_INVITE_SENT,
        entityType: AUDIT_ENTITY_TYPES.PARENT,
        entityId: parent.id,
        result: "FAILURE",
        metadata: {
          method: "magic_link",
          ...(studentId ? { studentContextId: studentId } : {}),
          errorCode:
            sendResult.reason === "RATE_LIMITED"
              ? "rate_limited"
              : "send_failed",
        },
        request: req,
      });

      if (sendResult.reason === "RATE_LIMITED") {
        return buildErrorResponse(409, "Conflict", "Rate limit exceeded", {
          reason: "RATE_LIMITED",
          retryAfterSeconds: sendResult.retryAfterSeconds,
        });
      }
      return buildErrorResponse(500, "InternalError", "Unable to send link", {
        reason: "UNKNOWN",
      });
    }

    await writeAuditEvent({
      tenantId: resolvedTenantId,
      actorType: AuditActorType.USER,
      actorId,
      actorDisplay,
      action: AUDIT_ACTIONS.PARENT_INVITE_SENT,
      entityType: AUDIT_ENTITY_TYPES.PARENT,
      entityId: parent.id,
      result: "SUCCESS",
      metadata: {
        method: "magic_link",
        ...(studentId ? { studentContextId: studentId } : {}),
      },
      request: req,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (tenantId && parentId) {
      await writeAuditEvent({
        tenantId,
        actorType: AuditActorType.USER,
        actorId,
        actorDisplay,
        action: AUDIT_ACTIONS.PARENT_INVITE_SENT,
        entityType: AUDIT_ENTITY_TYPES.PARENT,
        entityId: parentId,
        result: "FAILURE",
        metadata: {
          method: "magic_link",
          ...(studentId ? { studentContextId: studentId } : {}),
          errorCode: toAuditErrorCode(error),
        },
        request: req,
      });
    }
    // Avoid logging PII (emails/tokens) from request bodies or auth headers.
    logError(
      "POST /api/parents/[parentId]/send-magic-link failed",
      {
        tenantId,
        parentId,
        studentId,
        reason: (error as Error | undefined)?.name ?? "unknown",
      },
      req,
    );
    return buildErrorResponse(500, "InternalError", "Internal server error", {
      reason: "UNKNOWN",
    });
  }
}
