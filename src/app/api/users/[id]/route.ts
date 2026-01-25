// Single-user API routes with tenant scoping, RBAC, and center assignments.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
import { Prisma, Role } from "@/generated/prisma/client";

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

type CenterSummary = { id: string; name: string };
type StaffCenterRow = {
  userId: string;
  center: CenterSummary;
};

type StaffCenterClient = {
  staffCenter?: {
    findMany: (args: {
      where: { tenantId: string; userId: { in: string[] } };
      include: { center: { select: { id: true; name: true } } };
    }) => Promise<Array<{ userId: string; center: CenterSummary }>>;
    deleteMany: (args: {
      where: { tenantId: string; userId: string };
    }) => Promise<unknown>;
    createMany: (args: {
      data: Array<{ tenantId: string; userId: string; centerId: string }>;
      skipDuplicates: boolean;
    }) => Promise<unknown>;
  };
  $queryRaw: <T>(query: Prisma.Sql) => Promise<T>;
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
};

function hasStaffCenterDelegate(
  client: StaffCenterClient
): client is StaffCenterClient & { staffCenter: NonNullable<StaffCenterClient["staffCenter"]> } {
  return typeof client.staffCenter !== "undefined";
}

async function getStaffCentersForUsers(
  client: StaffCenterClient,
  tenantId: string,
  userIds: string[]
): Promise<StaffCenterRow[]> {
  if (!userIds.length) return [];

  // Fallback to raw SQL if the Prisma client is stale and missing StaffCenter.
  if (!hasStaffCenterDelegate(client)) {
    const rows = await client.$queryRaw<
      { userId: string; centerId: string; centerName: string }[]
    >(Prisma.sql`
      SELECT
        sc."userId" AS "userId",
        c."id" AS "centerId",
        c."name" AS "centerName"
      FROM "StaffCenter" sc
      JOIN "Center" c ON c."id" = sc."centerId"
      WHERE sc."tenantId" = ${tenantId}
        AND sc."userId" IN (${Prisma.join(userIds)})
    `);

    return rows.map((row) => ({
      userId: row.userId,
      center: { id: row.centerId, name: row.centerName },
    }));
  }

  const staffCenters = await client.staffCenter.findMany({
    where: {
      tenantId,
      userId: { in: userIds },
    },
    include: {
      center: {
        select: { id: true, name: true },
      },
    },
  });

  return staffCenters.map((staffCenter) => ({
    userId: staffCenter.userId,
    center: staffCenter.center,
  }));
}

async function replaceStaffCentersForUser(
  client: StaffCenterClient,
  tenantId: string,
  userId: string,
  centers: CenterSummary[]
) {
  // Fallback to raw SQL when the StaffCenter delegate is unavailable.
  if (!hasStaffCenterDelegate(client)) {
    await client.$executeRaw(Prisma.sql`
      DELETE FROM "StaffCenter"
      WHERE "tenantId" = ${tenantId}
        AND "userId" = ${userId}
    `);

    if (centers.length) {
      const values = centers.map((center) =>
        Prisma.sql`(${randomUUID()}, ${tenantId}, ${userId}, ${center.id})`
      );
      await client.$executeRaw(Prisma.sql`
        INSERT INTO "StaffCenter" ("id", "tenantId", "userId", "centerId")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("tenantId", "userId", "centerId") DO NOTHING
      `);
    }

    return;
  }

  await client.staffCenter.deleteMany({
    where: { tenantId, userId },
  });

  if (centers.length) {
    await client.staffCenter.createMany({
      data: centers.map((center) => ({
        tenantId,
        userId,
        centerId: center.id,
      })),
      skipDuplicates: true,
    });
  }
}

function normalizeCenterIds(centerIds: string[] | undefined) {
  if (!centerIds) return undefined;
  const unique = new Set(centerIds.map((id) => id.trim()).filter(Boolean));
  return Array.from(unique);
}

async function fetchCentersForTenant(tenantId: string, centerIds: string[]) {
  // Validate centerIds against the tenant scope before any write.
  const centers = await prisma.center.findMany({
    where: {
      tenantId,
      id: { in: centerIds },
    },
    select: { id: true, name: true },
  });

  if (centers.length !== centerIds.length) {
    return null;
  }

  return centers;
}

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

    const membership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId: parsedId.data,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const centers = await getStaffCentersForUsers(prisma, tenantId, [
      membership.userId,
    ]);

    return NextResponse.json({
      user: membership.user,
      membership: {
        id: membership.id,
        tenantId: membership.tenantId,
        userId: membership.userId,
        role: membership.role,
      },
      centers: centers.map((staffCenter) => staffCenter.center),
    });
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

    const normalizedCenterIds = normalizeCenterIds(data.centerIds);
    const resolvedCenters =
      normalizedCenterIds && normalizedCenterIds.length
        ? await fetchCentersForTenant(tenantId, normalizedCenterIds)
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

    const existingMembership = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId: parsedId.data,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!existingMembership) {
      return NextResponse.json({ error: "NotFound" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = data.name
        ? await tx.user.update({
            where: { id: existingMembership.userId },
            data: { name: data.name },
            select: { id: true, name: true, email: true },
          })
        : existingMembership.user;

      const membership = data.role
        ? await tx.tenantMembership.update({
            where: {
              tenantId_userId: {
                tenantId,
                userId: existingMembership.userId,
              },
            },
            data: { role: data.role },
          })
        : existingMembership;

      let centers: CenterSummary[];

      if (resolvedCenters) {
        await replaceStaffCentersForUser(
          tx,
          tenantId,
          existingMembership.userId,
          resolvedCenters
        );
        centers = resolvedCenters;
      } else {
        const existingCenters = await getStaffCentersForUsers(
          tx,
          tenantId,
          [existingMembership.userId]
        );
        centers = existingCenters.map((row) => row.center);
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
