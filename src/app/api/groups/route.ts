// Groups collection API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  normalizeIdArray,
  validateGroupForeignKeys,
  validateStudentIds,
  validateTutorEligibility,
} from "@/lib/groups/data";
import { GroupType, type Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const CreateGroupSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.nativeEnum(GroupType),
    centerId: z.string().trim().min(1),
    programId: z.string().trim().min(1),
    levelId: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    notes: z.string().trim().min(1).nullable().optional(),
    tutorIds: z.array(z.string().trim().min(1)).optional(),
    studentIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const groups = await prisma.group.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
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
        _count: { select: { tutors: true, students: true } },
      },
    });

    // Stable response shape for admin list rendering.
    const payload = groups.map((group) => ({
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
      tutorsCount: group._count.tutors,
      studentsCount: group._count.students,
    }));

    // Response shape: { groups: GroupListItem[] }.
    return NextResponse.json({ groups: payload });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/groups failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function POST(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
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

    const parsed = CreateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const tutorIds = normalizeIdArray(data.tutorIds);
    const studentIds = normalizeIdArray(data.studentIds);

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

    const tutorValidation = await validateTutorEligibility(
      prisma,
      tenantId,
      data.centerId,
      tutorIds,
    );
    if (!tutorValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: tutorValidation.message },
        { status: 400 },
      );
    }

    const studentValidation = await validateStudentIds(
      prisma,
      tenantId,
      studentIds,
    );
    if (!studentValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: studentValidation.message },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          tenantId,
          name: data.name,
          type: data.type,
          centerId: data.centerId,
          programId: data.programId,
          levelId: data.levelId ?? null,
          isActive: data.isActive ?? true,
          capacity: data.capacity ?? null,
          notes: data.notes ?? null,
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

      if (tutorIds.length) {
        await tx.groupTutor.createMany({
          data: tutorIds.map((userId) => ({
            tenantId,
            groupId: group.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

      if (studentIds.length) {
        await tx.groupStudent.createMany({
          data: studentIds.map((studentId) => ({
            tenantId,
            groupId: group.id,
            studentId,
          })),
          skipDuplicates: true,
        });
      }

      return group;
    });

    // Response shape: { group: GroupCore }.
    return NextResponse.json({ group: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/groups failed", error);
    return jsonError(500, "Internal server error");
  }
}
