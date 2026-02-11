/**
 * @state.route /api/portal/students/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Parent portal student detail endpoint scoped by tenant + parent linkage.
import { NextRequest, NextResponse } from "next/server";

import { StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertParentLinkedToStudent,
  buildPortalError,
  requirePortalParent,
} from "@/lib/portal/parent";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    // Return 404 when the parent is not linked to avoid ID-guessing leakage.
    const linkError = await assertParentLinkedToStudent(
      tenantId,
      ctx.parentId,
      id,
    );
    if (linkError) return linkError;

    const student = await prisma.student.findFirst({
      where: { tenantId, id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        level: { select: { id: true, name: true } },
      },
    });

    if (!student) {
      return buildPortalError(404, "NOT_FOUND");
    }

    return NextResponse.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        isActive: student.status === StudentStatus.ACTIVE,
        level: student.level ? { id: student.level.id, name: student.level.name } : null,
      },
    });
  } catch (error) {
    console.error("GET /api/portal/students/[id] failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
