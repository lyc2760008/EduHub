// Admin audit log endpoint with tenant scoping, RBAC, and optional filters.
import { NextRequest, NextResponse } from "next/server";

import {
  AUDIT_ACTIONS,
  AUDIT_AUTH_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from "@/lib/audit/constants";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  AuditActorType,
  type Prisma,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type ErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

type AuditCategory = "auth" | "requests" | "attendance" | "admin";

const CATEGORY_MAP: Record<
  AuditCategory,
  { actions?: string[]; entityType?: string }
> = {
  // "auth" focuses on parent auth + access code rotation activity.
  auth: { actions: [...AUDIT_AUTH_ACTIONS] },
  // "requests" maps to absence request entities.
  requests: { entityType: AUDIT_ENTITY_TYPES.REQUEST },
  // "attendance" maps to parent-visible attendance note updates.
  attendance: { entityType: AUDIT_ENTITY_TYPES.ATTENDANCE },
  // "admin" is reserved for staff-driven actions outside auth/requests/attendance.
  admin: { actions: [AUDIT_ACTIONS.PARENT_ACCESS_CODE_RESET] },
};

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

function parseDateParam(
  value: string | null,
  field: "from" | "to",
): Date | null | Response {
  if (!value || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return buildErrorResponse(400, "ValidationError", "Invalid date filter", {
      field,
    });
  }
  return parsed;
}

function parseActorType(value: string | null) {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  if (
    Object.values(AuditActorType).includes(trimmed as AuditActorType)
  ) {
    return trimmed as AuditActorType;
  }
  return buildErrorResponse(400, "ValidationError", "Invalid actorType", {
    field: "actorType",
  });
}

function parseCategory(value: string | null) {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim().toLowerCase();
  if (Object.keys(CATEGORY_MAP).includes(trimmed)) {
    return trimmed as AuditCategory;
  }
  return buildErrorResponse(400, "ValidationError", "Invalid category", {
    field: "category",
  });
}

function parsePagination(url: URL) {
  const takeParam = Number(url.searchParams.get("take"));
  const skipParam = Number(url.searchParams.get("skip"));

  const takeRaw =
    Number.isFinite(takeParam) && takeParam > 0 ? Math.floor(takeParam) : 50;
  const take = Math.min(takeRaw, 200);
  const skip =
    Number.isFinite(skipParam) && skipParam >= 0 ? Math.floor(skipParam) : 0;

  return { take, skip };
}

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const { take, skip } = parsePagination(url);

    const from = parseDateParam(url.searchParams.get("from"), "from");
    if (from instanceof Response) return from;
    const to = parseDateParam(url.searchParams.get("to"), "to");
    if (to instanceof Response) return to;

    if (from && to && from > to) {
      return buildErrorResponse(400, "ValidationError", "Invalid date range", {
        from: from.toISOString(),
        to: to.toISOString(),
      });
    }

    const actorType = parseActorType(url.searchParams.get("actorType"));
    if (actorType instanceof Response) return actorType;

    const category = parseCategory(url.searchParams.get("category"));
    if (category instanceof Response) return category;

    const actionParam = url.searchParams.get("action")?.trim();
    const entityTypeParam = url.searchParams.get("entityType")?.trim();
    const entityId = url.searchParams.get("entityId")?.trim();

    const andFilters: Prisma.AuditEventWhereInput[] = [];
    if (actionParam) {
      andFilters.push({ action: actionParam });
    }
    if (entityTypeParam) {
      andFilters.push({ entityType: entityTypeParam });
    }
    if (entityId) {
      andFilters.push({ entityId });
    }

    if (category) {
      const mapped = CATEGORY_MAP[category];
      if (mapped.actions) {
        andFilters.push({ action: { in: mapped.actions } });
      }
      if (mapped.entityType) {
        andFilters.push({ entityType: mapped.entityType });
      }
    }

    const where: Prisma.AuditEventWhereInput = {
      tenantId,
      ...(actorType ? { actorType } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(andFilters.length ? { AND: andFilters } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          occurredAt: true,
          actorType: true,
          actorDisplay: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ip: true,
          userAgent: true,
        },
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        occurredAt: item.occurredAt.toISOString(),
      })),
      page: { take, skip, total },
    });
  } catch (error) {
    console.error("GET /api/admin/audit failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
