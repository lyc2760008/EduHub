import { AuditActorType, Prisma, type Role } from "@/generated/prisma/client";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/constants";
import { writeAuditEvent } from "@/lib/audit/writeAuditEvent";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { createAndLinkParentSchema } from "@/lib/validation/studentParentCreate";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ studentId: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

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

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

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
      return jsonError(422, "Validation error", {
        issues: parsed.error.issues,
      });
    }

    const { parent, relationship } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existingParent = await tx.parent.findUnique({
        where: { tenantId_email: { tenantId, email: parent.email } },
        select: parentSelect,
      });

      const ensuredParent =
        existingParent ??
        (await tx.parent.create({
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

      const link = await tx.studentParent.create({
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

      return { parent: ensuredParent, link };
    });

    // Audit the parent-student link creation without persisting invite content.
    await writeAuditEvent({
      tenantId,
      actorType: AuditActorType.USER,
      actorId: ctx.user.id,
      actorDisplay: ctx.user.email ?? ctx.user.name ?? null,
      action: AUDIT_ACTIONS.PARENT_LINKED_TO_STUDENT,
      entityType: AUDIT_ENTITY_TYPES.STUDENT,
      entityId: studentId,
      metadata: {
        parentId: result.parent.id,
        studentId,
      },
      request: req,
    });

    return NextResponse.json(
      { parent: result.parent, link: result.link },
      { status: 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(409, "Parent already linked to this student");
    }

    console.error(
      "POST /api/students/[studentId]/parents/create failed",
      error,
    );
    return jsonError(500, "Internal server error");
  }
}
