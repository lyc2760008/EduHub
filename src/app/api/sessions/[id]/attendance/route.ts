// Session attendance API routes with tenant scoping, RBAC, and roster validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { parseParentVisibleNote } from "@/lib/validation/attendance";
import {
  AttendanceStatus,
  RequestType,
  type Prisma,
  type Role,
} from "@/generated/prisma/client";

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

const AttendanceItemSchema = z
  .object({
    studentId: z.string().trim().min(1),
    status: z.nativeEnum(AttendanceStatus).nullable(),
    note: z.string().trim().max(1000).optional().nullable(),
    parentVisibleNote: z.string().trim().optional().nullable(),
  })
  .strict();

const AttendancePayloadSchema = z
  .object({
    items: z.array(AttendanceItemSchema),
  })
  .strict();

function buildErrorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  // Standardized error shape for all attendance endpoints.
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

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, READ_ROLES);
    if (ctx instanceof Response) return await normalizeAuthResponse(ctx);
    const tenantId = ctx.tenant.tenantId;

    const where: Prisma.SessionWhereInput = { id, tenantId };
    if (ctx.membership.role === "Tutor") {
      where.tutorId = ctx.user.id;
    }

    const session = await prisma.session.findFirst({
      where,
      select: {
        id: true,
        tutorId: true,
        centerId: true,
        startAt: true,
        endAt: true,
        sessionType: true,
        groupId: true,
        sessionStudents: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return buildErrorResponse(404, "NotFound", "Session not found");
    }

    let roster = session.sessionStudents.map((entry) => entry.student);
    if (!roster.length && session.groupId) {
      // Fallback to the current group roster when session students are missing.
      const groupRoster = await prisma.groupStudent.findMany({
        where: { tenantId, groupId: session.groupId },
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
        },
      });
      roster = groupRoster.map((entry) => entry.student);
    }
    const rosterStudentIds = roster.map((student) => student.id);

    const attendanceRows = rosterStudentIds.length
      ? await prisma.attendance.findMany({
          where: {
            tenantId,
            sessionId: session.id,
            studentId: { in: rosterStudentIds },
          },
          select: {
            studentId: true,
            status: true,
            note: true,
            // Parent-visible notes are editable by staff and safe to show in staff UI.
            parentVisibleNote: true,
            markedAt: true,
            markedByUserId: true,
          },
        })
      : [];

    const attendanceByStudentId = new Map(
      attendanceRows.map((row) => [
        row.studentId,
        {
          status: row.status,
          note: row.note,
          parentVisibleNote: row.parentVisibleNote,
          markedAt: row.markedAt,
          markedByUserId: row.markedByUserId,
        },
      ]),
    );

    const requestRows = rosterStudentIds.length
      ? await prisma.parentRequest.findMany({
          where: {
            tenantId,
            sessionId: session.id,
            studentId: { in: rosterStudentIds },
            type: RequestType.ABSENCE,
          },
          select: {
            id: true,
            studentId: true,
            type: true,
            status: true,
            reasonCode: true,
            message: true,
            createdAt: true,
            resolvedAt: true,
            resolvedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      : [];

    // Map absence requests once to avoid per-student lookups in the response.
    const requestByStudentId = new Map(
      requestRows.map((row) => [row.studentId, row]),
    );

    // Response shape: session summary + roster rows with optional attendance.
    return NextResponse.json({
      session: {
        id: session.id,
        tutorId: session.tutorId,
        centerId: session.centerId,
        startAt: session.startAt,
        endAt: session.endAt,
        sessionType: session.sessionType,
      },
      roster: roster.map((student) => {
        const request = requestByStudentId.get(student.id);
        return {
          student,
          attendance: attendanceByStudentId.get(student.id) ?? null,
          // Absence request summary is staff-safe and avoids exposing parent-only data.
          absenceRequest: request
            ? {
                id: request.id,
                type: request.type,
                status: request.status,
                reasonCode: request.reasonCode,
                message: request.message ?? null,
                createdAt: request.createdAt,
                resolvedAt: request.resolvedAt,
                resolvedBy: request.resolvedByUser
                  ? {
                      id: request.resolvedByUser.id,
                      name: request.resolvedByUser.name ?? null,
                      email: request.resolvedByUser.email,
                    }
                  : null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/sessions/[id]/attendance failed", error);
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

    const parsed = AttendancePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return buildErrorResponse(400, "ValidationError", "Invalid payload", {
        issues: parsed.error.issues,
      });
    }

    const session = await prisma.session.findFirst({
      where: { id, tenantId },
      select: { id: true, tutorId: true, groupId: true },
    });

    if (!session) {
      return buildErrorResponse(404, "NotFound", "Session not found");
    }

    if (ctx.membership.role === "Tutor" && session.tutorId !== ctx.user.id) {
      // Tutors can only update attendance for sessions they own.
      return buildErrorResponse(
        403,
        "Forbidden",
        "Tutor cannot mark attendance for this session",
      );
    }

    const normalizedItems = [];
    for (const item of parsed.data.items) {
      const parentVisibleNoteResult = parseParentVisibleNote(
        item.parentVisibleNote,
      );
      if (!parentVisibleNoteResult.ok) {
        return buildErrorResponse(
          400,
          parentVisibleNoteResult.error.code,
          parentVisibleNoteResult.error.message,
          parentVisibleNoteResult.error.details,
        );
      }
      normalizedItems.push({
        ...item,
        parentVisibleNote: parentVisibleNoteResult.value,
        parentVisibleNoteProvided: parentVisibleNoteResult.provided,
      });
    }

    const rosterEntries = await prisma.sessionStudent.findMany({
      where: { tenantId, sessionId: session.id },
      select: { studentId: true },
    });
    let rosterStudentIds = new Set(
      rosterEntries.map((entry) => entry.studentId),
    );
    let shouldBackfillRoster = false;

    if (rosterStudentIds.size === 0 && session.groupId) {
      // If session roster is empty, fall back to the current group roster.
      const groupStudents = await prisma.groupStudent.findMany({
        where: { tenantId, groupId: session.groupId },
        select: { studentId: true },
      });
      rosterStudentIds = new Set(
        groupStudents.map((entry) => entry.studentId),
      );
      shouldBackfillRoster = groupStudents.length > 0;
    }

    const invalidItem = parsed.data.items.find(
      (item) => !rosterStudentIds.has(item.studentId),
    );
    if (invalidItem) {
      return buildErrorResponse(
        400,
        "ValidationError",
        "Student is not in this session roster",
        { studentId: invalidItem.studentId },
      );
    }

    const now = new Date();
    const upsertItems = normalizedItems
      .filter((item) => item.status !== null)
      .map((item) => ({
        studentId: item.studentId,
        status: item.status as AttendanceStatus,
        note: item.note?.trim() ? item.note.trim() : null,
        parentVisibleNote: item.parentVisibleNote,
        parentVisibleNoteProvided: item.parentVisibleNoteProvided,
      }));
    const deleteStudentIds = normalizedItems
      .filter((item) => item.status === null)
      .map((item) => item.studentId);

    await prisma.$transaction(async (tx) => {
      if (shouldBackfillRoster) {
        // Backfill missing session roster so future reads stay consistent.
        await tx.sessionStudent.createMany({
          data: Array.from(rosterStudentIds).map((studentId) => ({
            tenantId,
            sessionId: session.id,
            studentId,
          })),
          skipDuplicates: true,
        });
      }

      if (upsertItems.length) {
        await Promise.all(
          upsertItems.map((item) =>
            tx.attendance.upsert({
              where: {
                tenantId_sessionId_studentId: {
                  tenantId,
                  sessionId: session.id,
                  studentId: item.studentId,
                },
              },
              create: {
                tenantId,
                sessionId: session.id,
                studentId: item.studentId,
                status: item.status,
                note: item.note,
                markedByUserId: ctx.user.id,
                markedAt: now,
                ...(item.parentVisibleNoteProvided
                  ? {
                      parentVisibleNote: item.parentVisibleNote,
                      parentVisibleNoteUpdatedAt: now,
                    }
                  : {}),
              },
              update: {
                status: item.status,
                note: item.note,
                markedByUserId: ctx.user.id,
                markedAt: now,
                ...(item.parentVisibleNoteProvided
                  ? {
                      parentVisibleNote: item.parentVisibleNote,
                      parentVisibleNoteUpdatedAt: now,
                    }
                  : {}),
              },
            }),
          ),
        );
      }

      if (deleteStudentIds.length) {
        await tx.attendance.deleteMany({
          where: {
            tenantId,
            sessionId: session.id,
            studentId: { in: deleteStudentIds },
          },
        });
      }
    });

    // Response shape: counts for upserted and cleared attendance rows.
    return NextResponse.json({
      updatedCount: upsertItems.length,
      clearedCount: deleteStudentIds.length,
    });
  } catch (error) {
    console.error("PUT /api/sessions/[id]/attendance failed", error);
    return buildErrorResponse(500, "InternalError", "Internal server error");
  }
}
