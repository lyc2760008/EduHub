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

    // Fetch tenant-level support contact fields without relying on generated Prisma types.
    const [tenantMeta] = await prisma.$queryRaw<
      Array<{
        timeZone: string | null;
        supportEmail: string | null;
        supportPhone: string | null;
      }>
    >`SELECT "timeZone", "supportEmail", "supportPhone" FROM "Tenant" WHERE "id" = ${tenantId} LIMIT 1`;

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

    const primaryCenter = await prisma.center.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { timezone: true },
    });
    // Prefer tenant-level timezone set at provisioning; fall back to the first center timezone.
    const tenantTimeZone = tenantMeta?.timeZone ?? primaryCenter?.timezone ?? null;

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
        timeZone: tenantTimeZone,
        supportEmail: tenantMeta?.supportEmail ?? null,
        supportPhone: tenantMeta?.supportPhone ?? null,
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
