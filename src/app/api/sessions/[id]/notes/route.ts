// Session notes API routes with tenant scoping, RBAC, and zod validation.
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

const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

const NotesPayloadSchema = z
  .object({
    internalNote: z.string().trim().max(4000).nullable().optional(),
    parentVisibleNote: z.string().trim().max(4000).nullable().optional(),
    homework: z.string().trim().max(2000).nullable().optional(),
    nextSteps: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const NOTES_SELECT = {
  internalNote: true,
  parentVisibleNote: true,
  homework: true,
  nextSteps: true,
  updatedAt: true,
  updatedByUserId: true,
} as const;

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for all session note endpoints.
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
    const data = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
      details?: unknown;
    };
    if (typeof data?.error === "string") {
      message = data.error;
    } else if (typeof data?.message === "string") {
      message = data.message;
    }
    if (data?.details) {
      details =
        typeof data.details === "string"
          ? { message: data.details }
          : (data.details as Record<string, unknown>);
    }
  } catch {
    // If the response body is not JSON, fall back to the default message.
  }

  return buildErrorResponse(status, code, message, details);
}

function normalizeOptionalText(value: string | null | undefined) {
  // Normalize empty strings to null while preserving undefined.
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, READ_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const session = await prisma.session.findFirst({
      where: { id, tenantId },
      select: { id: true, tutorId: true },
    });

    if (!session) {
      return buildErrorResponse(404, "NotFound", "Session not found");
    }

    if (ctx.membership.role === "Tutor" && session.tutorId !== ctx.user.id) {
      return buildErrorResponse(
        403,
        "Forbidden",
        "Tutor cannot access notes for this session",
      );
    }

    const note = await prisma.sessionNote.findUnique({
      where: { tenantId_sessionId: { tenantId, sessionId: session.id } },
      select: NOTES_SELECT,
    });

    return NextResponse.json({
      sessionId: session.id,
      notes: note ? { ...note } : null,
    });
  } catch (error) {
    console.error("GET /api/sessions/[id]/notes failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}

export async function PUT(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, READ_ROLES);
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

    const parsed = NotesPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const session = await prisma.session.findFirst({
      where: { id, tenantId },
      select: { id: true, tutorId: true },
    });

    if (!session) {
      return buildErrorResponse(404, "NotFound", "Session not found");
    }

    if (ctx.membership.role === "Tutor" && session.tutorId !== ctx.user.id) {
      return buildErrorResponse(
        403,
        "Forbidden",
        "Tutor cannot update notes for this session",
      );
    }

    const normalized = {
      internalNote: normalizeOptionalText(parsed.data.internalNote),
      parentVisibleNote: normalizeOptionalText(parsed.data.parentVisibleNote),
      homework: normalizeOptionalText(parsed.data.homework),
      nextSteps: normalizeOptionalText(parsed.data.nextSteps),
    };

    const note = await prisma.sessionNote.upsert({
      where: { tenantId_sessionId: { tenantId, sessionId: session.id } },
      create: {
        tenantId,
        sessionId: session.id,
        updatedByUserId: ctx.user.id,
        ...normalized,
      },
      update: {
        ...normalized,
        updatedByUserId: ctx.user.id,
      },
      select: NOTES_SELECT,
    });

    return NextResponse.json({
      sessionId: session.id,
      notes: { ...note },
    });
  } catch (error) {
    console.error("PUT /api/sessions/[id]/notes failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
