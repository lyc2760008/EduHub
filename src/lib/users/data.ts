// Tenant-scoped user data helpers for APIs/SSR to avoid duplicated joins and unsafe access.
// All helpers require tenantId to keep multi-tenant isolation explicit.
import { randomUUID } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
  type Role,
} from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

type RawSqlClient = {
  $queryRaw: <T>(query: Prisma.Sql) => Promise<T>;
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
};

type DbClient = PrismaClient | TransactionClient;

type StaffCenterRow = {
  userId: string;
  center: CenterSummary;
};

export type CenterSummary = { id: string; name: string };

type StaffCenterDelegate = {
  // Prisma's generated delegate signatures vary; keep these loose but shape-safe.
  staffCenter?: {
    findMany: (
      args: unknown,
    ) => Promise<
      Array<{ userId: string; center: { id: string; name: string } }>
    >;
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
};

type StaffCenterClient = StaffCenterDelegate & RawSqlClient;

export type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  centers: CenterSummary[];
};

function hasStaffCenterDelegate(
  client: StaffCenterDelegate,
): client is StaffCenterDelegate & {
  staffCenter: NonNullable<StaffCenterDelegate["staffCenter"]>;
} {
  return typeof client.staffCenter !== "undefined";
}

// Shared lookup supports paginated user lists without duplicating raw SQL fallbacks.
export async function getStaffCentersForUsers(
  client: DbClient,
  tenantId: string,
  userIds: string[],
): Promise<StaffCenterRow[]> {
  if (!userIds.length) return [];
  // Cast to a raw-capable client to keep fallback SQL usage type-safe.
  // Prisma TransactionClient has a narrower delegate signature; cast via unknown to reuse helpers.
  const staffClient = client as unknown as StaffCenterClient;

  // Fallback to raw SQL if the Prisma client is stale and missing StaffCenter.
  if (!hasStaffCenterDelegate(staffClient)) {
    const rows = await staffClient.$queryRaw<
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

  const staffCenters = await staffClient.staffCenter.findMany({
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

export async function getUsersForTenant(
  prisma: DbClient,
  tenantId: string,
): Promise<UserListItem[]> {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const userIds = memberships.map((membership) => membership.userId);
  const staffCenters = await getStaffCentersForUsers(prisma, tenantId, userIds);

  const centersByUserId = new Map<string, CenterSummary[]>();
  for (const staffCenter of staffCenters) {
    const existing = centersByUserId.get(staffCenter.userId) ?? [];
    existing.push(staffCenter.center);
    centersByUserId.set(staffCenter.userId, existing);
  }

  const users = memberships.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    centers: centersByUserId.get(membership.userId) ?? [],
  }));

  // Stable ordering by display name or email improves deterministic admin lists.
  return users.sort((a, b) => {
    const aKey = (a.name ?? a.email).toLowerCase();
    const bKey = (b.name ?? b.email).toLowerCase();
    return aKey.localeCompare(bKey);
  });
}

export async function getUserDetailForTenant(
  prisma: DbClient,
  tenantId: string,
  userId: string,
): Promise<{
  user: { id: string; name: string | null; email: string };
  membership: { id: string; tenantId: string; userId: string; role: Role };
  centers: CenterSummary[];
} | null> {
  // Membership check enforces tenant isolation even when the userId is known.
  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId,
      },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!membership) {
    return null;
  }

  const centers = await getStaffCentersForUsers(prisma, tenantId, [
    membership.userId,
  ]);

  return {
    user: membership.user,
    membership: {
      id: membership.id,
      tenantId: membership.tenantId,
      userId: membership.userId,
      role: membership.role,
    },
    centers: centers.map((row) => row.center),
  };
}

export function normalizeCenterIds(centerIds?: string[]): string[] | undefined {
  if (!centerIds) return undefined;
  // Trim + de-dupe to prevent duplicate joins and noisy updates.
  const unique = new Set(centerIds.map((id) => id.trim()).filter(Boolean));
  return Array.from(unique);
}

export async function fetchCentersForTenant(
  prisma: DbClient,
  tenantId: string,
  centerIds: string[],
): Promise<CenterSummary[] | null> {
  if (!centerIds.length) return [];

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

export async function replaceStaffCentersForUser(
  client: DbClient,
  tenantId: string,
  userId: string,
  centers: CenterSummary[],
): Promise<void> {
  // Prisma TransactionClient has a narrower delegate signature; cast via unknown to reuse helpers.
  const staffClient = client as unknown as StaffCenterClient;
  const uniqueCenters = Array.from(
    new Map(centers.map((center) => [center.id, center])).values(),
  );

  // Replace-set semantics keep assignments in sync without diffing.
  if (!hasStaffCenterDelegate(staffClient)) {
    await staffClient.$executeRaw(Prisma.sql`
      DELETE FROM "StaffCenter"
      WHERE "tenantId" = ${tenantId}
        AND "userId" = ${userId}
    `);

    if (uniqueCenters.length) {
      const values = uniqueCenters.map(
        (center) =>
          Prisma.sql`(${randomUUID()}, ${tenantId}, ${userId}, ${center.id})`,
      );
      await staffClient.$executeRaw(Prisma.sql`
        INSERT INTO "StaffCenter" ("id", "tenantId", "userId", "centerId")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("tenantId", "userId", "centerId") DO NOTHING
      `);
    }

    return;
  }

  await staffClient.staffCenter.deleteMany({
    where: { tenantId, userId },
  });

  if (uniqueCenters.length) {
    await staffClient.staffCenter.createMany({
      data: uniqueCenters.map((center) => ({
        tenantId,
        userId,
        centerId: center.id,
      })),
      skipDuplicates: true,
    });
  }
}
