// Programs collection API with tenant scoping, RBAC, and validation.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const CreateProgramSchema = z
  .object({
    name: z.string().trim().min(1),
    subjectId: z.string().trim().min(1).nullable().optional(),
    levelId: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    // Always scope by tenantId to prevent cross-tenant access.
    const programs = await prisma.program.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(programs);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/programs failed", error);
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
        { status: 400 },
      );
    }

    // Validate input before attempting to write to the database.
    const parsed = CreateProgramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;

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

    // Always scope by tenantId to prevent cross-tenant writes.
    const created = await prisma.program.create({
      data: {
        tenantId,
        ...data,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("POST /api/programs failed", error);
    return jsonError(500, "Internal server error");
  }
}
