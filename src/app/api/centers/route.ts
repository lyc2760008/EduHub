/**
 * @state.route /api/centers
 * @state.area api
 * @state.capabilities view:list, create:center
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Centers collection API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { isValidTimeZone } from "@/lib/timezones/isValidTimeZone";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const CreateCenterSchema = z
  .object({
    name: z.string().trim().min(1),
    timezone: z.string().trim().min(1),
    isActive: z.boolean().optional(),
    address1: z.string().trim().min(1).optional(),
    address2: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    province: z.string().trim().min(1).optional(),
    postalCode: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";

    // Always scope by tenantId to prevent cross-tenant access.
    const centers = await prisma.center.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(centers);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/centers failed", error);
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
      // Validation error shape is consistent for malformed JSON payloads.
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Validate input before attempting to write to the database.
    const parsed = CreateCenterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 }
      );
    }
    // Timezone must be a valid IANA identifier to keep scheduling consistent.
    if (!isValidTimeZone(parsed.data.timezone)) {
      return NextResponse.json(
        { error: "ValidationError", details: "Invalid timezone" },
        { status: 400 }
      );
    }

    // Always scope by tenantId to prevent cross-tenant writes.
    const created = await prisma.center.create({
      data: {
        tenantId,
        ...parsed.data,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("POST /api/centers failed", error);
    return jsonError(500, "Internal server error");
  }
}
