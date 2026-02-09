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

        // Group list data is loaded client-side via the shared admin table contract.
        const [centers, programs, levels] = await Promise.all([
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

        return (
          <AdminPageShell
            title={t("admin.groupsList.title")}
            subtitle={t("admin.groupsList.helper")}
            maxWidth="max-w-6xl"
            testId="groups-page"
          >
            <GroupsClient
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
