/**
 * @state.route /api/admin/students/[id]/invite-data
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Admin endpoint for invite template inputs (no secrets) scoped by tenant + linkage.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

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

const InviteDataQuerySchema = z
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
  // Standardized error shape keeps admin invite-data handling predictable.
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

function buildDisplayName(firstName: string, lastName: string) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || undefined;
}

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id: studentId } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsed = InviteDataQuerySchema.safeParse({
      parentId: url.searchParams.get("parentId")?.trim() ?? "",
    });
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid parentId", {
        issues: parsed.error.issues,
      });
    }

    const parentId = parsed.data.parentId;

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      return buildErrorResponse(404, "NotFound", "Student not found");
    }

    const parent = await prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, firstName: true, lastName: true, email: true },
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

    const portalPath = ctx.tenant.tenantSlug
      ? `/${ctx.tenant.tenantSlug}/parent/login`
      : "/parent/login";
    const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    // Prefer absolute URLs when base origin is configured; fall back to a relative login path.
    // TODO: If AUTH_URL/NEXTAUTH_URL is missing in an environment, the relative path is used.
    const portalUrl = baseUrl ? new URL(portalPath, baseUrl).toString() : portalPath;

    const studentName = buildDisplayName(student.firstName, student.lastName);
    const parentName = buildDisplayName(parent.firstName, parent.lastName);
    const tenantDisplayName = ctx.tenant.tenantName?.trim() || undefined;

    return NextResponse.json({
      portalUrl,
      parentEmail: parent.email,
      ...(tenantDisplayName ? { tenantDisplayName } : {}),
      context: {
        studentId: student.id,
        parentId: parent.id,
        ...(studentName ? { studentName } : {}),
        ...(parentName ? { parentName } : {}),
      },
    });
  } catch (error) {
    console.error("GET /api/admin/students/[id]/invite-data failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
