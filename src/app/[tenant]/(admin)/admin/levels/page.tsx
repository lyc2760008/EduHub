// Admin levels page that relies on shared RBAC gate + shell and delegates UI to a client component.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import LevelsClient from "@/components/admin/levels/LevelsClient";
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

export default async function LevelsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {async (access) => {
        const tenantId = access.tenant.tenantId;
        // Tenant-scoped initial load keeps client render fast and isolated.
        const levels = await prisma.level.findMany({
          where: { tenantId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });

        return (
          <AdminPageShell
            title={t("admin.levels.title")}
            maxWidth="max-w-5xl"
            testId="levels-page"
          >
            <LevelsClient initialLevels={levels} />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
