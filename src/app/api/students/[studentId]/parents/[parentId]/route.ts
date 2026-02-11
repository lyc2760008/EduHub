/**
 * @state.route /api/students/[studentId]/parents/[parentId]
 * @state.area api
 * @state.capabilities delete:parent
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ studentId: string; parentId: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

export async function DELETE(req: NextRequest, context: Params) {
  try {
    const { studentId, parentId } = await context.params;

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

    const parent = await prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true },
    });
    if (!parent) {
      return jsonError(404, "Parent not found");
    }

    // Tenant-scoped delete ensures cross-tenant links cannot be removed.
    const deleted = await prisma.studentParent.deleteMany({
      where: { tenantId, studentId, parentId },
    });

    if (deleted.count === 0) {
      return jsonError(404, "Parent link not found");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "DELETE /api/students/[studentId]/parents/[parentId] failed",
      error
    );
    return jsonError(500, "Internal server error");
  }
}
