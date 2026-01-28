// Admin reports page that wires server-side RBAC to client-side report tables.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import ReportsClient from "@/components/admin/reports/ReportsClient";
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

export default async function ReportsPage({ params }: PageProps) {
  // i18n: resolve localized copy on the server for the page shell.
  const t = await getTranslations();
  // Next.js may deliver params as a Promise for server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        // RBAC context keeps tenantId scoping explicit for data queries.
        const tenantId = access.tenant.tenantId;
        // Load centers and tutor options up front to keep client filters simple.
        const [centers, users] = await Promise.all([
          getCenters(tenantId, { includeInactive: true }),
          getUsersForTenant(prisma, tenantId),
        ]);

        const centerOptions = centers.map((center) => ({
          id: center.id,
          name: center.name,
        }));

        const tutorOptions = users
          .filter((user) => user.role === "Tutor")
          .map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
          }));

        return (
          <AdminPageShell
            title={t("admin.reports.title")}
            maxWidth="max-w-6xl"
            testId="reports-page"
          >
            <ReportsClient centers={centerOptions} tutors={tutorOptions} />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
