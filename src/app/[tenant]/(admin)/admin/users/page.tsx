// Admin users page that loads tenant-scoped users and centers with RBAC guardrails.
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { Prisma, type Role } from "@/generated/prisma/client";
import UsersClient from "@/components/admin/users/UsersClient";
import { getCenters } from "@/lib/centers/getCenters";
import { prisma } from "@/lib/db/prisma";
import { requirePageRole } from "@/lib/rbac/page";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

type CenterOption = {
  id: string;
  name: string;
};

type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  centers: CenterOption[];
};

type StaffCenterRecord = {
  userId: string;
  center: CenterOption;
};

async function getStaffCentersForUsers(
  tenantId: string,
  userIds: string[]
): Promise<StaffCenterRecord[]> {
  if (!userIds.length) {
    return [];
  }

  // Fallback to raw SQL if the Prisma client is stale and missing StaffCenter.
  const hasStaffCenterDelegate =
    typeof (prisma as { staffCenter?: unknown }).staffCenter !== "undefined";

  if (!hasStaffCenterDelegate) {
    const rows = await prisma.$queryRaw<
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

  const staffCenters = await prisma.staffCenter.findMany({
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

async function getUsersForTenant(tenantId: string): Promise<UserListItem[]> {
  // Tenant-scoped query mirrors the /api/users response shape for SSR.
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const userIds = memberships.map((membership) => membership.userId);
  const staffCenters = await getStaffCentersForUsers(tenantId, userIds);

  const centersByUserId = new Map<string, CenterOption[]>();
  for (const staffCenter of staffCenters) {
    const existing = centersByUserId.get(staffCenter.userId) ?? [];
    existing.push(staffCenter.center);
    centersByUserId.set(staffCenter.userId, existing);
  }

  return memberships.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    centers: centersByUserId.get(membership.userId) ?? [],
  }));
}

export default async function UsersPage({ params }: PageProps) {
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  // Redirect to login when unauthenticated; otherwise show access denied UI.
  const access = await requirePageRole(tenant, ADMIN_ROLES);
  if (!access.ok) {
    if (access.status === 401) {
      redirect(`/${tenant}/login`);
    }

    return (
      <div
        className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-6 py-10"
        data-testid="access-denied"
      >
        <h1 className="text-2xl font-semibold">
          {t("admin.accessDenied.title")}
        </h1>
        <p className="text-sm text-slate-600">
          {t("admin.accessDenied.message")}
        </p>
      </div>
    );
  }

  const tenantId = access.ctx.tenant.tenantId;
  // Load centers for checkbox options and users for initial render.
  const [centers, users] = await Promise.all([
    getCenters(tenantId, { includeInactive: true }),
    getUsersForTenant(tenantId),
  ]);

  const centerOptions = centers.map((center) => ({
    id: center.id,
    name: center.name,
  }));

  return (
    <div
      className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10"
      data-testid="users-page"
    >
      <h1 className="text-2xl font-semibold">{t("admin.users.title")}</h1>
      <UsersClient initialUsers={users} centers={centerOptions} />
    </div>
  );
}
