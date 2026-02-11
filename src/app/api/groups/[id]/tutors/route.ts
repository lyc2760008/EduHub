/**
 * @state.route /api/groups/[id]/tutors
 * @state.area api
 * @state.capabilities update:tutor
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Replace-group-tutors API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  getGroupCoreForTenant,
  normalizeIdArray,
  replaceGroupTutors,
  validateTutorEligibility,
} from "@/lib/groups/data";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const ReplaceTutorsSchema = z
  .object({
    tutorIds: z.array(z.string().trim().min(1)),
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

    const parsed = ReplaceTutorsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const tutorIds = normalizeIdArray(parsed.data.tutorIds);

    const group = await getGroupCoreForTenant(prisma, tenantId, id);
    if (!group) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const tutorValidation = await validateTutorEligibility(
      prisma,
      tenantId,
      group.centerId,
      tutorIds,
    );
    if (!tutorValidation.ok) {
      return NextResponse.json(
        { error: "ValidationError", details: tutorValidation.message },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await replaceGroupTutors(tx, tenantId, group.id, tutorIds);
    });

    // Response shape: { tutorIds: string[], tutorsCount: number }.
    return NextResponse.json({
      tutorIds,
      tutorsCount: tutorIds.length,
    });
  } catch (error) {
    console.error("PUT /api/groups/[id]/tutors failed", error);
    return jsonError(500, "Internal server error");
  }
}
