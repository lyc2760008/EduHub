/**
 * @state.route /api/sessions/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Single-session API route with tenant scoping, RBAC, and roster snapshot.
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import type { Prisma, Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    const ctx = await requireRole(req, READ_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const where: Prisma.SessionWhereInput = { id, tenantId };

    if (ctx.membership.role === "Tutor") {
      where.tutorId = ctx.user.id;
    }

    const session = await prisma.session.findFirst({
      where,
      select: {
        id: true,
        centerId: true,
        tutorId: true,
        sessionType: true,
        groupId: true,
        startAt: true,
        endAt: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        center: { select: { name: true } },
        tutor: { select: { name: true } },
        group: { select: { name: true, type: true } },
        sessionStudents: {
          select: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                preferredName: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const roster = session.sessionStudents.map((entry) => entry.student);

    return NextResponse.json({
      session: {
        id: session.id,
        centerId: session.centerId,
        centerName: session.center.name,
        tutorId: session.tutorId,
        tutorName: session.tutor.name ?? null,
        sessionType: session.sessionType,
        groupId: session.groupId,
        groupName: session.group?.name ?? null,
        groupType: session.group?.type ?? null,
        startAt: session.startAt,
        endAt: session.endAt,
        timezone: session.timezone,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        roster,
      },
    });
  } catch (error) {
    console.error("GET /api/sessions/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}
