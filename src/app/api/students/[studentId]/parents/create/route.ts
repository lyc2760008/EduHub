import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireTenantId } from "@/lib/http/tenant";
import { createAndLinkParentSchema } from "@/lib/validation/studentParentCreate";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ studentId: string }>;
};

const parentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
} satisfies Prisma.ParentSelect;

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

    const parsed = createAndLinkParentSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(422, "Validation error", { issues: parsed.error.issues });
    }

    const { parent, relationship } = parsed.data;

    const existingParent = await prisma.parent.findUnique({
      where: { tenantId_email: { tenantId, email: parent.email } },
      select: parentSelect,
    });

    const ensuredParent =
      existingParent ??
      (await prisma.parent.create({
        data: {
          tenantId,
          firstName: parent.firstName,
          lastName: parent.lastName,
          email: parent.email,
          phone: parent.phone,
          notes: parent.notes,
        },
        select: parentSelect,
      }));

    const link = await prisma.studentParent.create({
      data: {
        tenantId,
        studentId,
        parentId: ensuredParent.id,
        relationship,
      },
      select: {
        id: true,
        studentId: true,
        parentId: true,
        relationship: true,
      },
    });

    return NextResponse.json(
      { parent: ensuredParent, link },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(409, "Parent already linked to this student");
    }

    console.error("POST /api/students/[studentId]/parents/create failed", error);
    return jsonError(500, "Internal server error");
  }
}
