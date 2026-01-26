// Admin groups page that relies on shared RBAC gate + shell and delegates UI to a client component.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import GroupsClient from "@/components/admin/groups/GroupsClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function GroupsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const tenantId = access.tenant.tenantId;

        const [groups, centers, programs, levels] = await Promise.all([
          prisma.group.findMany({
            where: { tenantId },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              type: true,
              centerId: true,
              programId: true,
              levelId: true,
              isActive: true,
              capacity: true,
              notes: true,
              center: { select: { name: true } },
              program: { select: { name: true } },
              level: { select: { name: true } },
              _count: { select: { tutors: true, students: true } },
            },
          }),
          prisma.center.findMany({
            where: { tenantId },
            orderBy: { name: "asc" },
            select: { id: true, name: true, isActive: true },
          }),
          prisma.program.findMany({
            where: { tenantId },
            orderBy: { name: "asc" },
            select: { id: true, name: true, isActive: true },
          }),
          prisma.level.findMany({
            where: { tenantId },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, isActive: true },
          }),
        ]);

        const initialGroups = groups.map((group) => ({
          id: group.id,
          name: group.name,
          type: group.type,
          centerId: group.centerId,
          centerName: group.center.name,
          programId: group.programId,
          programName: group.program.name,
          levelId: group.levelId,
          levelName: group.level?.name ?? null,
          isActive: group.isActive,
          capacity: group.capacity,
          notes: group.notes,
          tutorsCount: group._count.tutors,
          studentsCount: group._count.students,
        }));

        return (
          <AdminPageShell
            title={t("admin.groups.title")}
            maxWidth="max-w-6xl"
            testId="groups-page"
          >
            <GroupsClient
              initialGroups={initialGroups}
              centers={centers}
              programs={programs}
              levels={levels}
              tenant={tenant}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
