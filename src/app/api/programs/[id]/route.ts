/**
 * @state.route /api/programs/[id]
 * @state.area api
 * @state.capabilities view:detail, update:program
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Single-program API routes with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const UpdateProgramSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    subjectId: z.string().trim().min(1).nullable().optional(),
    levelId: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function GET(req: NextRequest, context: Params) {
  try {
    const { id } = await context.params;

    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    // Always scope by tenantId to prevent cross-tenant access.
    const program = await prisma.program.findFirst({
      where: { id, tenantId },
    });

    if (!program) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    return NextResponse.json(program);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/programs/[id] failed", error);
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
    const parsed = UpdateProgramSchema.safeParse(body);
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

    // Tenant-scoped existence check keeps updates isolated even with id-only where.
    const existing = await prisma.program.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    // Validate optional catalog links within the same tenant.
    if (data.subjectId !== undefined && data.subjectId !== null) {
      const subject = await prisma.subject.findFirst({
        where: { id: data.subjectId, tenantId },
        select: { id: true },
      });
      if (!subject) {
        return NextResponse.json(
          { error: "ValidationError", details: "Subject not found for tenant" },
          { status: 400 },
        );
      }
    }

    if (data.levelId !== undefined && data.levelId !== null) {
      const level = await prisma.level.findFirst({
        where: { id: data.levelId, tenantId },
        select: { id: true },
      });
      if (!level) {
        return NextResponse.json(
          { error: "ValidationError", details: "Level not found for tenant" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.program.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("PATCH /api/programs/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}
