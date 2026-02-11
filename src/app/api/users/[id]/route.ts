/**
 * @state.route /api/users/[id]
 * @state.area api
 * @state.capabilities view:detail, update:user
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Single-user API routes with tenant scoping, RBAC, and center assignments.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  fetchCentersForTenant,
  getUserDetailForTenant,
  normalizeCenterIds,
  replaceStaffCentersForUser,
  type CenterSummary,
} from "@/lib/users/data";
import { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const UserIdSchema = z.string().trim().min(1);

const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    role: z.nativeEnum(Role).optional(),
    centerIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const parsedId = UserIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsedId.error.issues },
        { status: 400 },
      );
    }

    const detail = await getUserDetailForTenant(
      prisma,
      tenantId,
      parsedId.data,
    );

    if (!detail) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/users/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}

export async function PATCH(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const parsedId = UserIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsedId.error.issues },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Validation error shape is consistent for malformed JSON payloads.
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 },
      );
    }

    // Validate input before attempting to write to the database.
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const hasUpdates =
      data.name !== undefined ||
      data.role !== undefined ||
      data.centerIds !== undefined;
    if (!hasUpdates) {
      return NextResponse.json(
        { error: "ValidationError", details: "No fields to update" },
        { status: 400 },
      );
    }

    // Normalize centerIds to avoid duplicates while preserving tenant validation.
    const normalizedCenterIds = normalizeCenterIds(data.centerIds);
    const resolvedCenters =
      normalizedCenterIds && normalizedCenterIds.length
        ? await fetchCentersForTenant(prisma, tenantId, normalizedCenterIds)
        : normalizedCenterIds
          ? []
          : undefined;

    if (resolvedCenters === null) {
      return NextResponse.json(
        {
          error: "ValidationError",
          details: "One or more centers do not belong to this tenant",
        },
        { status: 400 },
      );
    }

    const detail = await getUserDetailForTenant(
      prisma,
      tenantId,
      parsedId.data,
    );

    if (!detail) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = data.name
        ? await tx.user.update({
            where: { id: detail.user.id },
            data: { name: data.name },
            select: { id: true, name: true, email: true },
          })
        : detail.user;

      const membership = data.role
        ? await tx.tenantMembership.update({
            where: {
              tenantId_userId: {
                tenantId,
                userId: detail.user.id,
              },
            },
            data: { role: data.role },
          })
        : detail.membership;

      let centers: CenterSummary[];

      if (resolvedCenters) {
        await replaceStaffCentersForUser(
          tx,
          tenantId,
          detail.user.id,
          resolvedCenters,
        );
        centers = resolvedCenters;
      } else {
        // Preserve existing centers when no update is provided.
        centers = detail.centers;
      }

      return { user, membership, centers };
    });

    return NextResponse.json({
      user: result.user,
      membership: {
        id: result.membership.id,
        tenantId: result.membership.tenantId,
        userId: result.membership.userId,
        role: result.membership.role,
      },
      centers: result.centers,
    });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("PATCH /api/users/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}
