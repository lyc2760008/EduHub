// Single-center API routes with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { isValidTimeZone } from "@/lib/timezones/isValidTimeZone";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const UpdateCenterSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    timezone: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
    address1: z.string().trim().min(1).optional(),
    address2: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    province: z.string().trim().min(1).optional(),
    postalCode: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
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
    const center = await prisma.center.findFirst({
      where: { id, tenantId },
    });

    if (!center) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    return NextResponse.json(center);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/centers/[id] failed", error);
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
        { status: 400 }
      );
    }

    // Validate input before attempting to write to the database.
    const parsed = UpdateCenterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const hasUpdates = Object.values(data).some((value) => value !== undefined);
    if (!hasUpdates) {
      return NextResponse.json(
        { error: "ValidationError", details: "No fields to update" },
        { status: 400 }
      );
    }
    // Ensure updated timezones are valid IANA identifiers.
    if (data.timezone && !isValidTimeZone(data.timezone)) {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid timezone" },
        { status: 400 }
      );
    }

    // Tenant-scoped existence check keeps updates isolated even with id-only where.
    const existing = await prisma.center.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const updated = await prisma.center.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("PATCH /api/centers/[id] failed", error);
    return jsonError(500, "Internal server error");
  }
}
