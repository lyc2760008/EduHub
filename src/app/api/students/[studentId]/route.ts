import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { resolveTenant } from "@/lib/tenant/resolveTenant";
import { updateStudentSchema } from "@/lib/validation/student";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ studentId: string }>;
};

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
} satisfies Prisma.StudentSelect;

export async function GET(req: NextRequest, context: Params) {
  try {
    const { studentId } = await context.params;

    const tenant = await resolveTenant(req);
    if (tenant instanceof NextResponse) return tenant;
    const tenantId = tenant.tenantId;

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

    const tenant = await resolveTenant(req);
    if (tenant instanceof NextResponse) return tenant;
    const tenantId = tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(422, "Validation error", { issues: parsed.error.issues });
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return jsonError(422, "Validation error", { message: "Request body is empty" });
    }

    const existing = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return jsonError(404, "Student not found");
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        preferredName: data.preferredName,
        grade: data.grade,
        dateOfBirth: data.dateOfBirth,
        status: data.status,
        notes: data.notes,
      },
      select: studentSelect,
    });

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
