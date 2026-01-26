// Replace-group-students API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  getGroupCoreForTenant,
  normalizeIdArray,
  replaceGroupStudents,
  validateStudentIds,
} from "@/lib/groups/data";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const ReplaceStudentsSchema = z
  .object({
    studentIds: z.array(z.string().trim().min(1)),
  })
  .strict();

export async function PUT(req: NextRequest, context: Params) {
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

    const parsed = ReplaceStudentsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const studentIds = normalizeIdArray(parsed.data.studentIds);

    const group = await getGroupCoreForTenant(prisma, tenantId, id);
    if (!group) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
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

    await prisma.$transaction(async (tx) => {
      await replaceGroupStudents(tx, tenantId, group.id, studentIds);
    });

    // Response shape: { studentIds: string[], studentsCount: number }.
    return NextResponse.json({
      studentIds,
      studentsCount: studentIds.length,
    });
  } catch (error) {
    console.error("PUT /api/groups/[id]/students failed", error);
    return jsonError(500, "Internal server error");
  }
}
