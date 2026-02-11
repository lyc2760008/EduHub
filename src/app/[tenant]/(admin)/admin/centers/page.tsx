/**
 * @state.route /[tenant]/admin/centers
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Admin centers page that relies on shared RBAC gate + shell and delegates UI to a client component.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import CentersClient from "@/components/admin/centers/CentersClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getCenters } from "@/lib/centers/getCenters";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function CentersPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {async (access) => {
        // RBAC context from AdminAccessGate keeps data scoped to the tenant.
        // Tenant-scoped fetch keeps centers isolated per tenant.
        const centers = await getCenters(access.tenant.tenantId, {
          includeInactive: true,
        });

        return (
          <AdminPageShell
            title={t("admin.centers.title")}
            maxWidth="max-w-5xl"
            testId="centers-page"
          >
            <CentersClient initialCenters={centers} tenant={tenant} />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
