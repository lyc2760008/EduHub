// Sessions collection API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { Prisma, SessionType, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

const CreateSessionSchema = z
  .object({
    centerId: z.string().trim().min(1),
    tutorId: z.string().trim().min(1),
    sessionType: z.nativeEnum(SessionType),
    startAt: z.string().trim().datetime({ offset: true }),
    endAt: z.string().trim().datetime({ offset: true }),
    timezone: z.string().trim().min(1),
    studentId: z.string().trim().min(1).optional(),
    groupId: z.string().trim().min(1).optional(),
  })
  .strict();

function parseDateParam(value: string | null): Date | null | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, READ_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const centerId = url.searchParams.get("centerId")?.trim() || undefined;
    const tutorIdParam = url.searchParams.get("tutorId")?.trim() || undefined;
    const startAtFromParam = url.searchParams.get("startAtFrom");
    const startAtToParam = url.searchParams.get("startAtTo");

    const startAtFrom = parseDateParam(startAtFromParam);
    if (startAtFrom === null) {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid startAtFrom" },
        { status: 400 },
      );
    }

    const startAtTo = parseDateParam(startAtToParam);
    if (startAtTo === null) {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid startAtTo" },
        { status: 400 },
      );
    }

    if (startAtFrom && startAtTo && startAtFrom > startAtTo) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "startAtFrom must be <= startAtTo",
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const startAtLowerBound =
      startAtFrom && startAtFrom > now ? startAtFrom : now;

    const where: Prisma.SessionWhereInput = {
      tenantId,
      startAt: {
        gte: startAtLowerBound,
        ...(startAtTo ? { lte: startAtTo } : {}),
      },
      ...(centerId ? { centerId } : {}),
    };

    if (ctx.membership.role === "Tutor") {
      where.tutorId = ctx.user.id;
    } else if (tutorIdParam) {
      where.tutorId = tutorIdParam;
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        centerId: true,
        tutorId: true,
        sessionType: true,
        groupId: true,
        startAt: true,
        endAt: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        center: { select: { name: true } },
        tutor: { select: { name: true } },
        group: { select: { name: true, type: true } },
      },
    });

    const payload = sessions.map((session) => ({
      id: session.id,
      centerId: session.centerId,
      centerName: session.center.name,
      tutorId: session.tutorId,
      tutorName: session.tutor.name ?? null,
      sessionType: session.sessionType,
      groupId: session.groupId,
      groupName: session.group?.name ?? null,
      groupType: session.group?.type ?? null,
      startAt: session.startAt,
      endAt: session.endAt,
      timezone: session.timezone,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));

    return NextResponse.json({ sessions: payload });
  } catch (error) {
    console.error("GET /api/sessions failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);

    if (startAt >= endAt) {
      return NextResponse.json(
        { error: "ValidationError", details: "endAt must be after startAt" },
        { status: 400 },
      );
    }

    if (data.sessionType === "ONE_ON_ONE") {
      if (!data.studentId) {
        return NextResponse.json(
          { error: "ValidationError", details: "studentId is required" },
          { status: 400 },
        );
      }
      if (data.groupId) {
        return NextResponse.json(
          { error: "ValidationError", details: "groupId is not allowed" },
          { status: 400 },
        );
      }
    }

    if (data.sessionType === "GROUP" || data.sessionType === "CLASS") {
      if (!data.groupId) {
        return NextResponse.json(
          { error: "ValidationError", details: "groupId is required" },
          { status: 400 },
        );
      }
      if (data.studentId) {
        return NextResponse.json(
          { error: "ValidationError", details: "studentId is not allowed" },
          { status: 400 },
        );
      }
    }

    const center = await prisma.center.findFirst({
      where: { id: data.centerId, tenantId },
      select: { id: true },
    });
    if (!center) {
      return NextResponse.json(
        { error: "ValidationError", details: "Center not found for tenant" },
        { status: 400 },
      );
    }

    const tutorMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: data.tutorId, role: "Tutor" },
      select: { id: true },
    });
    if (!tutorMembership) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "Tutor must have Tutor role in this tenant",
        },
        { status: 400 },
      );
    }

    const staffCenter = await prisma.staffCenter.findFirst({
      where: { tenantId, userId: data.tutorId, centerId: data.centerId },
      select: { id: true },
    });
    if (!staffCenter) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "Tutor is not assigned to this center",
        },
        { status: 400 },
      );
    }

    if (data.sessionType === "ONE_ON_ONE") {
      const student = await prisma.student.findFirst({
        where: { id: data.studentId, tenantId },
        select: { id: true },
      });
      if (!student) {
        return NextResponse.json(
          { error: "ValidationError", details: "Student not found for tenant" },
          { status: 400 },
        );
      }
    }

    if (data.sessionType !== "ONE_ON_ONE") {
      const group = await prisma.group.findFirst({
        where: { id: data.groupId, tenantId },
        select: { id: true, centerId: true, type: true },
      });
      if (!group) {
        return NextResponse.json(
          { error: "ValidationError", details: "Group not found for tenant" },
          { status: 400 },
        );
      }
      if (group.centerId !== data.centerId) {
        return NextResponse.json(
          {
            error: "ValidationError",
            details: "Group does not belong to center",
          },
          { status: 400 },
        );
      }
      if (data.sessionType === "GROUP" && group.type !== "GROUP") {
        return NextResponse.json(
          { error: "ValidationError", details: "Group type must be GROUP" },
          { status: 400 },
        );
      }
      if (data.sessionType === "CLASS" && group.type !== "CLASS") {
        return NextResponse.json(
          { error: "ValidationError", details: "Group type must be CLASS" },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          tenantId,
          centerId: data.centerId,
          tutorId: data.tutorId,
          sessionType: data.sessionType,
          groupId: data.groupId ?? null,
          startAt,
          endAt,
          timezone: data.timezone,
        },
        select: {
          id: true,
          tenantId: true,
          centerId: true,
          tutorId: true,
          sessionType: true,
          groupId: true,
          startAt: true,
          endAt: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      let rosterStudentIds: string[] = [];

      if (data.sessionType === "ONE_ON_ONE") {
        rosterStudentIds = [data.studentId!];
      } else if (data.groupId) {
        const groupStudents = await tx.groupStudent.findMany({
          where: { tenantId, groupId: data.groupId },
          select: { studentId: true },
        });
        rosterStudentIds = groupStudents.map((entry) => entry.studentId);
      }

      if (rosterStudentIds.length) {
        await tx.sessionStudent.createMany({
          data: rosterStudentIds.map((studentId) => ({
            tenantId,
            sessionId: session.id,
            studentId,
          })),
          skipDuplicates: true,
        });
      }

      return { session, rosterCount: rosterStudentIds.length };
    });

    return NextResponse.json(
      { session: result.session, rosterCount: result.rosterCount },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(
        409,
        "Session already exists for this tutor and start time",
      );
    }
    console.error("POST /api/sessions failed", error);
    return jsonError(500, "Internal server error");
  }
}
