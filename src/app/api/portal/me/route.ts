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

    const linkedActiveStudentCount = linkedStudentIds.length
      ? await prisma.student.count({
          where: {
            tenantId,
            id: { in: linkedStudentIds },
            status: StudentStatus.ACTIVE,
          },
        })
      : 0;

    const displayName = [ctx.parent.firstName, ctx.parent.lastName]
      .filter(Boolean)
      .join(" ");

    // Response is intentionally minimal to keep portal data exposure scoped.
    return NextResponse.json({
      parent: {
        id: ctx.parent.id,
        email: ctx.parent.email,
        name: displayName || null,
        // accessCodeHash presence is treated as the active flag for portal access.
        isActive: Boolean(ctx.parent.accessCodeHash),
      },
      linkedStudentIds,
      linkedStudentCount: linkedStudentIds.length,
      linkedActiveStudentCount,
    });
  } catch (error) {
    console.error("GET /api/portal/me failed", error);
    return buildPortalError(500, "InternalError", "Internal server error");
  }
}
