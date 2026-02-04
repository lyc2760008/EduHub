// Parent portal "me" endpoint with tenant- and parent-scoped fields only.
import { NextRequest, NextResponse } from "next/server";

import { StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildPortalError,
  getLinkedStudentIds,
  requirePortalParent,
} from "@/lib/portal/parent";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Parent RBAC + tenant resolution must happen before any data access.
    const ctx = await requirePortalParent(req);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const linkedStudentIds = await getLinkedStudentIds(
      tenantId,
      ctx.parentId,
    );

    const linkedStudents = linkedStudentIds.length
      ? await prisma.student.findMany({
          where: {
            tenantId,
            id: { in: linkedStudentIds },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        })
      : [];

    const parentDisplayName = [ctx.parent.firstName, ctx.parent.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return NextResponse.json({
      parent: {
        id: ctx.parent.id,
        email: ctx.parent.email,
        displayName: parentDisplayName || null,
      },
      tenant: {
        id: ctx.tenant.tenantId,
        slug: ctx.tenant.tenantSlug,
        displayName: ctx.tenant.tenantName ?? ctx.tenant.tenantSlug ?? null,
        timeZone: "UTC",
      },
      students: linkedStudents.map((student) => ({
        id: student.id,
        displayName: [student.firstName, student.lastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
        isActive: student.status === StudentStatus.ACTIVE,
      })),
    });
  } catch (error) {
    console.error("GET /api/portal/me failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
