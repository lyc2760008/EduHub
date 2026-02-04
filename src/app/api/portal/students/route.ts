// Parent portal students endpoint with tenant + parent linkage enforcement.
import { NextRequest, NextResponse } from "next/server";

import { StudentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildPortalError,
  getLinkedStudentIds,
  parsePortalPagination,
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
    const { take, skip } = parsePortalPagination(req, {
      take: 50,
      maxTake: 100,
      skip: 0,
    });

    if (linkedStudentIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, take, skip });
    }

    const where = {
      tenantId,
      id: { in: linkedStudentIds },
    };

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        orderBy: [
          // Status ordering keeps ACTIVE students first, then inactive/archived.
          { status: "asc" },
          { lastName: "asc" },
          { firstName: "asc" },
        ],
        skip,
        take,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          level: { select: { id: true, name: true } },
        },
      }),
      prisma.student.count({ where }),
    ]);

    const items = students.map((student) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      isActive: student.status === StudentStatus.ACTIVE,
      level: student.level ? { id: student.level.id, name: student.level.name } : null,
    }));

    return NextResponse.json({ items, total, take, skip });
  } catch (error) {
    console.error("GET /api/portal/students failed", error);
    return buildPortalError(500, "INTERNAL_ERROR");
  }
}
