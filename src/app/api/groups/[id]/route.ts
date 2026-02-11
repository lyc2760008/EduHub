/**
 * @state.route /api/groups/[id]
 * @state.area api
 * @state.capabilities view:detail, update:group
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Single-group API routes with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  getGroupCoreForTenant,
  validateGroupForeignKeys,
} from "@/lib/groups/data";
import { GroupType, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const UpdateGroupSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: z.nativeEnum(GroupType).optional(),
    centerId: z.string().trim().min(1).optional(),
    programId: z.string().trim().min(1).optional(),
    levelId: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const group = await prisma.group.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        type: true,
        centerId: true,
        programId: true,
        levelId: true,
        isActive: true,
        capacity: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        center: { select: { name: true } },
        program: { select: { name: true } },
        level: { select: { name: true } },
        tutors: {
          select: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        students: {
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

    if (!group) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const tutors = group.tutors.map((link) => link.user);
    const students = group.students.map((link) => link.student);

    // Response shape: { group: GroupDetail } with tutors + students roster.
    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        type: group.type,
        centerId: group.centerId,
        centerName: group.center.name,
        programId: group.programId,
        programName: group.program.name,
        levelId: group.levelId,
        levelName: group.level?.name ?? null,
        isActive: group.isActive,
        capacity: group.capacity,
        notes: group.notes,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        tutors,
        students,
      },
    });
  } catch (error) {
    console.error("GET /api/groups/[id] failed", error);
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

    const parsed = UpdateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const hasUpdates = Object.values(data).some((value) => value !== undefined);
    if (!hasUpdates) {
      return NextResponse.json(
        { error: "ValidationError", details: "No fields to update" },
        { status: 400 },
      );
    }

    const existing = await getGroupCoreForTenant(prisma, tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const fkValidation = await validateGroupForeignKeys(prisma, tenantId, {
      centerId: data.centerId,
      programId: data.programId,
      levelId: data.levelId,
    });
    if (!fkValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: fkValidation.message },
        { status: 400 },
      );
    }

    const updated = await prisma.group.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        type: data.type,
        centerId: data.centerId,
        programId: data.programId,
        levelId: data.levelId,
        isActive: data.isActive,
        capacity: data.capacity,
        notes: data.notes,
      },
      select: {
        id: true,
        name: true,
        type: true,
        centerId: true,
        programId: true,
        levelId: true,
        isActive: true,
        capacity: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ group: updated });
  } catch (error) {
    console.error("PATCH /api/groups/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}
