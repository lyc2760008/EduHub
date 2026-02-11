/**
 * @state.route /api/students/[studentId]
 * @state.area api
 * @state.capabilities view:detail, update:student
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { Prisma, StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { updateStudentSchema } from "@/lib/validation/student";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ studentId: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const studentSelect = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  grade: true,
  status: true,
  dateOfBirth: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  level: { select: { id: true, name: true } },
} satisfies Prisma.StudentSelect;

export async function GET(req: NextRequest, context: Params) {
  try {
    const { studentId } = await context.params;

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: studentSelect,
    });

    if (!student) {
      return jsonError(404, "Student not found");
    }

    return NextResponse.json({ student });
  } catch (error) {
    console.error("GET /api/students/[studentId] failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function PATCH(req: NextRequest, context: Params) {
  try {
    const { studentId } = await context.params;

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Validation error", { issues: parsed.error.issues });
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return jsonError(400, "Validation error", { message: "Request body is empty" });
    }

    if (data.levelId !== undefined && data.levelId !== null) {
      const level = await prisma.level.findFirst({
        where: { id: data.levelId, tenantId },
        select: { id: true },
      });
      if (!level) {
        return jsonError(404, "Level not found");
      }
    }

    const status =
      data.status ??
      (data.isActive === undefined
        ? undefined
        : data.isActive
          ? StudentStatus.ACTIVE
          : StudentStatus.INACTIVE);

    // updateMany expects the unchecked update input to support levelId mutations.
    const updateData: Prisma.StudentUncheckedUpdateManyInput = {
      firstName: data.firstName,
      lastName: data.lastName,
      preferredName: data.preferredName,
      grade: data.grade,
      levelId: data.levelId === undefined ? undefined : data.levelId,
      dateOfBirth: data.dateOfBirth,
      // Map isActive to status when provided, while keeping status as canonical.
      status,
      notes: data.notes === undefined ? undefined : data.notes,
    };

    const [result, updated] = await prisma.$transaction([
      prisma.student.updateMany({
        where: { id: studentId, tenantId },
        data: updateData,
      }),
      prisma.student.findFirst({
        where: { id: studentId, tenantId },
        select: studentSelect,
      }),
    ]);

    if (result.count === 0 || !updated) {
      return jsonError(404, "Student not found");
    }

    return NextResponse.json({ student: updated });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(409, "Conflict");
    }

    console.error("PATCH /api/students/[studentId] failed", error);
    return jsonError(500, "Internal server error");
  }
}
