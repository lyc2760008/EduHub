/**
 * @state.route /api/sessions/[id]
 * @state.area api
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Single-session API route with tenant scoping, RBAC, and roster snapshot.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { normalizeZoomLink } from "@/lib/sessions/zoomLink";
import type { Prisma, Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];
const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const UpdateSessionSchema = z
  .object({
    zoomLink: z.string().nullable().optional(),
  })
  .strict();

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
        zoomLink: true,
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
        zoomLink: session.zoomLink,
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

export async function PATCH(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = UpdateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    if (parsed.data.zoomLink === undefined) {
      return NextResponse.json(
        { error: "ValidationError", details: "No fields provided" },
        { status: 400 },
      );
    }

    let normalizedZoomLink: string | null = null;
    try {
      normalizedZoomLink = normalizeZoomLink(parsed.data.zoomLink);
    } catch {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid zoom link" },
        { status: 400 },
      );
    }

    const result = await prisma.session.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        zoomLink: normalizedZoomLink,
      },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      zoomLink: normalizedZoomLink,
    });
  } catch (error) {
    console.error("PATCH /api/sessions/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}
