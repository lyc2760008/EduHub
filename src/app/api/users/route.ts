// Users collection API with tenant scoping, RBAC, and center assignments.
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { jsonError } from "@/lib/http/response";
import { requireRole } from "@/lib/rbac";
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

type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  centers: { id: string; name: string }[];
};

type StaffCenterRow = {
  userId: string;
  center: { id: string; name: string };
};

type StaffCenterClient = {
  staffCenter?: {
    findMany: (args: {
      where: { tenantId: string; userId: { in: string[] } };
      include: { center: { select: { id: true; name: true } } };
    }) => Promise<Array<{ userId: string; center: { id: string; name: string } }>>;
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
  centers: { id: string; name: string }[]
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

export async function GET(req: NextRequest) {
  try {
    // RBAC guard runs first to avoid leaking tenant data to unauthorized users.
    const ctx = await requireRole(req, ADMIN_ROLES);
    if (ctx instanceof Response) return ctx;
    const tenantId = ctx.tenant.tenantId;

    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const userIds = memberships.map((membership) => membership.userId);

    const staffCenters = await getStaffCentersForUsers(
      prisma,
      tenantId,
      userIds
    );

    const centersByUserId = new Map<string, UserListItem["centers"]>();
    for (const staffCenter of staffCenters) {
      const existing = centersByUserId.get(staffCenter.userId) ?? [];
      existing.push({
        id: staffCenter.center.id,
        name: staffCenter.center.name,
      });
      centersByUserId.set(staffCenter.userId, existing);
    }

    const users: UserListItem[] = memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      centers: centersByUserId.get(membership.userId) ?? [],
    }));

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

      let centers: UserListItem["centers"];

      if (resolvedCenters) {
        await replaceStaffCentersForUser(
          tx,
          tenantId,
          user.id,
          resolvedCenters
        );
        centers = resolvedCenters;
      } else {
        const existingCenters = await getStaffCentersForUsers(
          tx,
          tenantId,
          [user.id]
        );
        centers = existingCenters.map((row) => row.center);
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
