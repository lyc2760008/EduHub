// Shared report query helpers with tenant-scoped guards and date parsing utilities.
import type { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireTenantMembership } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

// Standard error codes used by report endpoints.
type ErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

// Base date-only schema for report query params (YYYY-MM-DD).
export const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// Optional id schema used by centerId/tutorId search params.
const optionalIdSchema = z.string().trim().min(1).optional();

// Query params for upcoming sessions reports.
export const upcomingSessionsQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    centerId: optionalIdSchema,
    tutorId: optionalIdSchema,
  })
  .strict();

// Query params for weekly attendance reports.
export const weeklyAttendanceQuerySchema = z
  .object({
    weekStart: dateOnlySchema,
    centerId: optionalIdSchema,
  })
  .strict();

// Query params for student activity reports.
export const studentActivityQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    centerId: optionalIdSchema,
  })
  .strict();

// Format a Date as YYYY-MM-DD using UTC to avoid timezone shifts.
export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Parse a YYYY-MM-DD string into a UTC Date at 00:00.
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

// Add whole days in UTC (used for report range boundaries).
export function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// Get today's date at 00:00 UTC for consistent default ranges.
export function getUtcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// Parse and validate search params using the provided Zod schema.
export function parseReportParams<T extends z.ZodRawShape>(
  request: NextRequest,
  schema: z.ZodObject<T>,
): z.infer<typeof schema> {
  const url = new URL(request.url);
  const params: Record<string, string | undefined> = {};

  for (const key of Object.keys(schema.shape)) {
    const raw = url.searchParams.get(key);
    params[key] = raw ? raw.trim() || undefined : undefined;
  }

  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
}

// Convert auth/tenant errors into the standard report error shape.
async function normalizeAuthResponse(response: Response) {
  const status = response.status;
  const code: ErrorCode =
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
    // Fall back to the default message when response bodies are not JSON.
  }

  return buildReportError(status, code, message, details);
}

// Standardized JSON error response for report handlers.
export function buildReportError(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  return jsonError(status, message, { error: { code, message, details } });
}

// Resolve tenant + membership and enforce report RBAC (Admin/Owner, optional Tutor).
export async function requireReportAccess(
  request: NextRequest,
  options: { allowTutorUpcoming?: boolean } = {},
) {
  const ctx = await requireTenantMembership(request);
  if (ctx instanceof Response) {
    return await normalizeAuthResponse(ctx);
  }

  const allowedRoles: Role[] = options.allowTutorUpcoming
    ? ["Owner", "Admin", "Tutor"]
    : ["Owner", "Admin"];

  if (!allowedRoles.includes(ctx.membership.role)) {
    return buildReportError(403, "Forbidden", "Forbidden");
  }

  return ctx;
}

// Enforce tutor scoping for upcoming sessions (Tutor cannot query other tutors).
export function enforceTutorScopeForUpcoming(
  ctx: Exclude<Awaited<ReturnType<typeof requireTenantMembership>>, Response>,
  tutorId: string | undefined,
) {
  if (ctx.membership.role !== "Tutor") {
    return { tutorId };
  }

  if (tutorId && tutorId !== ctx.user.id) {
    return buildReportError(
      403,
      "Forbidden",
      "Tutor cannot access other tutors' sessions",
    );
  }

  return { tutorId: ctx.user.id };
}

// Validate that a provided centerId belongs to the tenant, or return 404.
export async function assertCenterInTenant(
  tenantId: string,
  centerId?: string,
) {
  if (!centerId) return null;

  const center = await prisma.center.findFirst({
    where: { id: centerId, tenantId },
    select: { id: true },
  });

  if (!center) {
    return buildReportError(404, "NotFound", "Center not found");
  }

  return null;
}
