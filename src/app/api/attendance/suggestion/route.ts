// Attendance suggestion endpoint surfaces absence-based guidance without writing data.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  AttendanceStatus,
  RequestStatus,
  RequestType,
  type Role,
} from "@/generated/prisma/client";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

type ErrorCode =
  | "ValidationError"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InternalError";

const SuggestionQuerySchema = z
  .object({
    sessionId: z.string().trim().min(1),
    studentId: z.string().trim().min(1),
  })
  .strict();

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for attendance suggestion responses.
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

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, READ_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const parsed = SuggestionQuerySchema.safeParse({
      sessionId: url.searchParams.get("sessionId"),
      studentId: url.searchParams.get("studentId"),
    });

    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid query", {
        issues: parsed.error.issues,
      });
    }

    const { sessionId, studentId } = parsed.data;

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        tenantId,
        // Tutor scoping uses tutorId to prevent cross-tutor session access.
        ...(ctx.membership.role === "Tutor" ? { tutorId: ctx.user.id } : {}),
      },
      select: { id: true },
    });

    if (!session) {
      return buildErrorResponse(404, "NotFound", "Session not found");
    }

    const rosterEntry = await prisma.sessionStudent.findFirst({
      where: { tenantId, sessionId: session.id, studentId },
      select: { id: true },
    });

    if (!rosterEntry) {
      // Return 404 to avoid leaking roster details for guessed student ids.
      return buildErrorResponse(404, "NotFound", "Student not found in session");
    }

    const [attendance, request] = await Promise.all([
      prisma.attendance.findUnique({
        where: {
          tenantId_sessionId_studentId: {
            tenantId,
            sessionId: session.id,
            studentId,
          },
        },
        select: { id: true },
      }),
      prisma.parentRequest.findFirst({
        where: {
          tenantId,
          sessionId: session.id,
          studentId,
          type: RequestType.ABSENCE,
        },
        select: {
          id: true,
          status: true,
          reasonCode: true,
          message: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
    ]);

    let suggestedStatus: AttendanceStatus | null = null;
    let suggestedExcused: boolean | undefined;
    let reason: { code?: string; message?: string } | undefined;
    let basedOnRequest:
      | {
          id: string;
          status: RequestStatus;
          reasonCode: string;
          createdAt: Date;
          resolvedAt: Date | null;
        }
      | undefined;
    let explanation: { code: string; message: string } | undefined;

    if (request) {
      if (request.status === RequestStatus.WITHDRAWN) {
        // Withdrawn requests must not trigger auto-assist suggestions or banners.
        explanation = {
          code: "REQUEST_WITHDRAWN",
          message: "Absence request was withdrawn",
        };
      } else {
        const message = request.message?.trim();
        reason = {
          code: request.reasonCode,
          ...(message ? { message } : {}),
        };
        basedOnRequest = {
          id: request.id,
          status: request.status,
          reasonCode: request.reasonCode,
          createdAt: request.createdAt,
          resolvedAt: request.resolvedAt ?? null,
        };

        if (request.status === RequestStatus.APPROVED) {
          // Use the existing EXCUSED attendance status to represent approved absences.
          suggestedStatus = AttendanceStatus.EXCUSED;
          suggestedExcused = true;
          explanation = {
            code: "REQUEST_APPROVED",
            message: "Approved absence request",
          };
        } else if (request.status === RequestStatus.PENDING) {
          explanation = {
            code: "REQUEST_PENDING",
            message: "Absence request is pending",
          };
        } else {
          explanation = {
            code: "REQUEST_DECLINED",
            message: "Absence request was declined",
          };
        }
      }
    }

    const attendanceExists = Boolean(attendance);

    return NextResponse.json({
      sessionId,
      studentId,
      suggested: {
        status: suggestedStatus,
        ...(suggestedExcused ? { excused: suggestedExcused } : {}),
        ...(reason ? { reason } : {}),
        ...(basedOnRequest ? { basedOnRequest } : {}),
        ...(explanation ? { explanation } : {}),
      },
      meta: {
        attendanceExists,
        ...(attendanceExists
          ? {
              notice: {
                code: "ATTENDANCE_ALREADY_RECORDED",
                message: "Attendance already recorded; suggestion provided only",
              },
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("GET /api/attendance/suggestion failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
