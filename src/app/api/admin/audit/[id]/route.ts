/**
 * @state.route /api/admin/audit/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Admin audit detail endpoint with tenant scoping and RBAC.
import { NextRequest, NextResponse } from "next/server";

import { AUDIT_LIST_SELECT } from "@/lib/audit/queryAuditEvents";
import { redactAuditEvent } from "@/lib/audit/redactAuditEvent";
import {
  getAuditEntityDisplay,
  resolveAuditEntityDisplayLookup,
} from "@/lib/audit/resolveAuditEntityDisplay";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

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

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for admin audit endpoints.
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

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const audit = await prisma.auditEvent.findFirst({
      where: { id, tenantId },
      select: AUDIT_LIST_SELECT,
    });

    if (!audit) {
      return buildErrorResponse(404, "NotFound", "Audit event not found");
    }
    const entityDisplayLookup = await resolveAuditEntityDisplayLookup({
      tenantId,
      rows: [audit],
    });

    // Redaction is mandatory for detail reads to avoid accidental sensitive-field exposure.
    return NextResponse.json({
      item: redactAuditEvent(audit, {
        entityDisplay: getAuditEntityDisplay(audit, entityDisplayLookup),
      }),
    });
  } catch (error) {
    console.error("GET /api/admin/audit/[id] failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
