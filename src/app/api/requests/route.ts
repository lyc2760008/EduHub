// Admin requests list endpoint with tenant scoping and RBAC enforcement.
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { parsePagination } from "@/lib/http/pagination";
import { requireRole } from "@/lib/rbac";
import { RequestStatus, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

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

function parseStatus(value: string | null): RequestStatus | "ALL" | Response {
  if (!value || !value.trim()) {
    // Default to pending to preserve the existing admin inbox UX.
    return RequestStatus.PENDING;
  }

  const trimmed = value.trim();
  // "ALL" is a UI convenience filter to return all statuses without additional endpoints.
  if (trimmed === "ALL") {
    return "ALL";
  }
  if (!Object.values(RequestStatus).includes(trimmed as RequestStatus)) {
    return buildErrorResponse(400, "ValidationError", "Invalid status", {
      field: "status",
    });
  }

  return trimmed as RequestStatus;
}

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const statusFilter = parseStatus(url.searchParams.get("status"));
    if (statusFilter instanceof Response) return statusFilter;

    const { page, pageSize, skip, take } = parsePagination(req);

    const where = {
      tenantId,
      ...(statusFilter === "ALL" ? {} : { status: statusFilter }),
    };

    const [items, total] = await Promise.all([
      prisma.parentRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
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
          // Withdraw/resubmit timestamps support admin detail context.
          withdrawnAt: true,
          resubmittedAt: true,
          resolvedAt: true,
          resolvedByUserId: true,
          parent: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          student: {
            select: { id: true, firstName: true, lastName: true },
          },
          session: {
            select: {
              id: true,
              startAt: true,
              endAt: true,
              sessionType: true,
              group: { select: { name: true } },
            },
          },
        },
      }),
      prisma.parentRequest.count({ where }),
    ]);

    return NextResponse.json({ items, page, pageSize, total });
  } catch (error) {
    console.error("GET /api/requests failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
