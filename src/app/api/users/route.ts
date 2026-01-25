// Users collection API with tenant scoping, RBAC, and center assignments.
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import {
  fetchCentersForTenant,
  getUserDetailForTenant,
  getUsersForTenant,
  normalizeCenterIds,
  replaceStaffCentersForUser,
  type CenterSummary,
} from "@/lib/users/data";
import { Prisma, Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

const CreateUserSchema = z
  .object({
    email: z.string().trim().email(),
    name: z.string().trim().min(1).optional(),
    role: z.nativeEnum(Role),
    centerIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const users = await getUsersForTenant(prisma, tenantId);

    return NextResponse.json(users);
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("GET /api/users failed", error);
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
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ValidationError", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
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

    // New users get a random password hash; onboarding is handled elsewhere.
    const passwordHash = await bcrypt.hash(randomUUID(), 10);

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true, name: true, email: true },
      });

      let user = existingUser;

      if (existingUser && data.name) {
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: { name: data.name },
          select: { id: true, name: true, email: true },
        });
      }

      if (!user) {
        try {
          user = await tx.user.create({
            data: {
              email: data.email,
              name: data.name,
              passwordHash,
            },
            select: { id: true, name: true, email: true },
          });
        } catch (error) {
          // Handle a rare concurrent create by reloading the existing user.
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            user = await tx.user.findUnique({
              where: { email: data.email },
              select: { id: true, name: true, email: true },
            });
          } else {
            throw error;
          }
        }
      }

      if (!user) {
        throw new Error("User creation failed");
      }

      const membership = await tx.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId,
            userId: user.id,
          },
        },
        update: { role: data.role },
        create: {
          tenantId,
          userId: user.id,
          role: data.role,
        },
      });

      let centers: CenterSummary[];

      if (resolvedCenters) {
        await replaceStaffCentersForUser(
          tx,
          tenantId,
          user.id,
          resolvedCenters,
        );
        centers = resolvedCenters;
      } else {
        // When no centerIds are provided, preserve any existing assignments.
        const detail = await getUserDetailForTenant(tx, tenantId, user.id);
        centers = detail?.centers ?? [];
      }

      return {
        user,
        role: membership.role,
        centers,
      };
    });

    return NextResponse.json({
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.role,
      centers: result.centers,
    });
  } catch (error) {
    // Internal errors return a generic response to avoid leaking details.
    console.error("POST /api/users failed", error);
    return jsonError(500, "Internal server error");
  }
}
