import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { linkStudentParentByEmailSchema } from "@/lib/validation/studentParent";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";

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

const linkSelect = {
  id: true,
  studentId: true,
  parentId: true,
  relationship: true,
} satisfies Prisma.StudentParentSelect;

// Derive required first/last names from optional name or email for existing schema.
const deriveParentName = (rawName: string | null | undefined, email: string) => {
  const normalized = rawName?.trim();
  const fallback = email.split("@")[0]?.trim() || "Parent";
  if (normalized) {
    const parts = normalized.split(/\s+/);
    if (parts.length > 1) {
      return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
    }
    return { firstName: normalized, lastName: "Parent" };
  }
  return { firstName: fallback, lastName: "Parent" };
};

export async function GET(req: NextRequest, context: Params) {
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

    const parsed = linkStudentParentByEmailSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Validation error", {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;
    const { firstName, lastName } = deriveParentName(
      data.name,
      data.parentEmail
    );

    const result = await prisma.$transaction(async (tx) => {
      const existingParent = await tx.parent.findUnique({
        where: { tenantId_email: { tenantId, email: data.parentEmail } },
        select: parentSelect,
      });

      const ensuredParent =
        existingParent ??
        (await tx.parent.create({
          data: {
            tenantId,
            firstName,
            lastName,
            email: data.parentEmail,
            phone: data.phone ?? undefined,
          },
          select: parentSelect,
        }));

      const existingLink = await tx.studentParent.findUnique({
        where: {
          tenantId_studentId_parentId: {
            tenantId,
            studentId,
            parentId: ensuredParent.id,
          },
        },
        select: linkSelect,
      });

      const ensuredLink =
        existingLink ??
        (await tx.studentParent.create({
          data: {
            tenantId,
            studentId,
            parentId: ensuredParent.id,
          },
          select: linkSelect,
        }));

      return { parent: ensuredParent, link: ensuredLink };
    });

    return NextResponse.json(
      { link: { ...result.link, parent: result.parent } },
      { status: 201 }
    );
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
