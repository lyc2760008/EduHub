// Admin users page that uses shared RBAC gate + shell and shared user data helpers.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import UsersClient from "@/components/admin/users/UsersClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getCenters } from "@/lib/centers/getCenters";
import { prisma } from "@/lib/db/prisma";
import { getUsersForTenant } from "@/lib/users/data";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function UsersPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {async (access) => {
        // RBAC context from AdminAccessGate keeps data scoped to the tenant.
        const tenantId = access.tenant.tenantId;
        // Load centers for checkbox options and users for initial render.
        const [centers, users] = await Promise.all([
          getCenters(tenantId, { includeInactive: true }),
          // Shared helper keeps staff-center joins consistent with API responses.
          getUsersForTenant(prisma, tenantId),
        ]);

        const centerOptions = centers.map((center) => ({
          id: center.id,
          name: center.name,
        }));

        return (
          <AdminPageShell
            title={t("admin.users.title")}
            maxWidth="max-w-5xl"
            testId="users-page"
          >
            <UsersClient
              initialUsers={users}
              centers={centerOptions}
              tenant={tenant}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
