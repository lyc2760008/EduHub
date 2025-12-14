import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireTenantId } from "@/lib/http/tenant";
import { linkStudentParentSchema } from "@/lib/validation/studentParent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ studentId: string }>;
};

export async function GET(req: NextRequest, context: Params) {
  try {
    const { studentId } = await context.params;

    const tenantId = requireTenantId(req);
    if (tenantId instanceof NextResponse) return tenantId;

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) {
      return jsonError(404, "Student not found");
    }

    const links = await prisma.studentParent.findMany({
      where: { tenantId, studentId },
      select: {
        id: true,
        parentId: true,
        relationship: true,
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const parents = links.map((link) => ({
      id: link.id,
      parentId: link.parentId,
      relationship: link.relationship,
      parent: link.parent,
    }));

    return NextResponse.json({ parents });
  } catch (error) {
    console.error("GET /api/students/[studentId]/parents failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function POST(req: NextRequest, context: Params) {
  try {
    const { studentId } = await context.params;

    const tenantId = requireTenantId(req);
    if (tenantId instanceof NextResponse) return tenantId;

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) {
      return jsonError(404, "Student not found");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    const parsed = linkStudentParentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(422, "Validation error", { issues: parsed.error.issues });
    }

    const data = parsed.data;

    const parent = await prisma.parent.findFirst({
      where: { id: data.parentId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      return jsonError(404, "Parent not found");
    }

    const link = await prisma.studentParent.create({
      data: {
        tenantId,
        studentId,
        parentId: data.parentId,
        relationship: data.relationship,
      },
      select: {
        id: true,
        parentId: true,
        relationship: true,
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(409, "Parent already linked to this student");
    }

    console.error("POST /api/students/[studentId]/parents failed", error);
    return jsonError(500, "Internal server error");
  }
}
