// Parent-portal API helpers for tenant-scoped access, linkage checks, and query parsing.
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { resolveTenant, type TenantContext } from "@/lib/tenant/resolveTenant";

export type PortalErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

export type PortalParentContext = {
  tenant: TenantContext;
  session: Session;
  parentId: string;
  parent: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    accessCodeHash: string | null;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

// Standardized JSON error response for parent portal routes.
export function buildPortalError(
  status: number,
  code: PortalErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  return jsonError(status, message, { error: { code, message, details } });
}

async function normalizeTenantResponse(response: Response) {
  // Convert tenant/auth errors into the portal error shape to keep responses stable.
  const status = response.status;
  const code: PortalErrorCode =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";
  let message =
    status === 401
      ? "Unauthorized"
      : status === 403
        ? "Forbidden"
        : status === 404
          ? "NotFound"
          : "ValidationError";
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

  return buildPortalError(status, code, message, details);
}

// Require a parent-authenticated session and resolve tenant/parent context.
export async function requirePortalParent(
  request: NextRequest,
): Promise<PortalParentContext | Response> {
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return buildPortalError(401, "Unauthorized", "Unauthorized");
  }

  if (session.user.role !== "Parent") {
    return buildPortalError(403, "Forbidden", "Forbidden");
  }

  const tenantResult = await resolveTenant(request);
  if (tenantResult instanceof Response) {
    return await normalizeTenantResponse(tenantResult);
  }

  if (session.user.tenantId !== tenantResult.tenantId) {
    return buildPortalError(403, "Forbidden", "Forbidden", {
      reason: "TenantMismatch",
    });
  }

  const parentId = session.user.parentId ?? session.user.id;
  if (!parentId) {
    return buildPortalError(401, "Unauthorized", "Unauthorized");
  }

  const parent = await prisma.parent.findFirst({
    where: { tenantId: tenantResult.tenantId, id: parentId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      accessCodeHash: true,
    },
  });

  if (!parent) {
    return buildPortalError(403, "Forbidden", "Forbidden", {
      reason: "ParentMissing",
    });
  }

  if (!parent.accessCodeHash) {
    // Treat missing access code as inactive parent access to prevent stale sessions.
    return buildPortalError(403, "Forbidden", "Forbidden", {
      reason: "ParentInactive",
    });
  }

  return { tenant: tenantResult, session, parentId: parent.id, parent };
}

// Fetch linked student ids for the tenant+parent combination.
export async function getLinkedStudentIds(tenantId: string, parentId: string) {
  const links = await prisma.studentParent.findMany({
    where: { tenantId, parentId },
    select: { studentId: true },
  });

  return links.map((link) => link.studentId);
}

// Enforce that a student is linked to the parent, returning 404 to avoid ID guessing.
export async function assertParentLinkedToStudent(
  tenantId: string,
  parentId: string,
  studentId: string,
): Promise<Response | null> {
  const link = await prisma.studentParent.findFirst({
    where: { tenantId, parentId, studentId },
    select: { id: true },
  });

  if (!link) {
    return buildPortalError(404, "NotFound", "Student not found");
  }

  return null;
}

// Parse numeric take/skip with defaults and max limits for portal lists.
export function parsePortalPagination(
  request: NextRequest,
  defaults: { take: number; maxTake: number; skip?: number },
) {
  const url = new URL(request.url);
  const takeParam = Number(url.searchParams.get("take"));
  const skipParam = Number(url.searchParams.get("skip"));

  const takeRaw =
    Number.isFinite(takeParam) && takeParam > 0
      ? Math.floor(takeParam)
      : defaults.take;
  const take = Math.min(takeRaw, defaults.maxTake);

  const skip =
    Number.isFinite(skipParam) && skipParam >= 0
      ? Math.floor(skipParam)
      : defaults.skip ?? 0;

  return { take, skip };
}

type PortalRangeConfig = {
  defaultFromOffsetDays: number;
  defaultToOffsetDays: number;
  maxRangeDays: number;
};

// Resolve a date range with defaults and enforce a maximum window.
export function resolvePortalRange(
  fromParam: string | null,
  toParam: string | null,
  config: PortalRangeConfig,
): { from: Date; to: Date } | Response {
  const parsedFrom = parseDateParam(fromParam);
  if (parsedFrom === null) {
    return buildPortalError(400, "ValidationError", "Invalid from date", {
      field: "from",
    });
  }

  const parsedTo = parseDateParam(toParam);
  if (parsedTo === null) {
    return buildPortalError(400, "ValidationError", "Invalid to date", {
      field: "to",
    });
  }

  const now = new Date();
  const defaultFrom = addDays(now, config.defaultFromOffsetDays);
  const defaultTo = addDays(now, config.defaultToOffsetDays);
  const windowDays = Math.abs(
    config.defaultToOffsetDays - config.defaultFromOffsetDays,
  );

  let from = parsedFrom ?? defaultFrom;
  let to = parsedTo ?? defaultTo;

  if (parsedFrom && !parsedTo) {
    to = addDays(parsedFrom, windowDays);
  }

  if (!parsedFrom && parsedTo) {
    from = addDays(parsedTo, -windowDays);
  }

  if (from > to) {
    return buildPortalError(400, "ValidationError", "from must be <= to", {
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }

  const rangeDays = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  if (rangeDays > config.maxRangeDays) {
    return buildPortalError(
      400,
      "ValidationError",
      "Date range too large",
      {
        maxDays: config.maxRangeDays,
      },
    );
  }

  return { from, to };
}

function parseDateParam(value: string | null): Date | null | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
