/**
 * @state.route /[tenant]/admin/reports/sessions-missing-resources
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Step 22.9 missing resources report page.
 */
// Missing-resources report page wires report options into the URL-state client table.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import MissingResourcesReportClient from "@/components/admin/reports/MissingResourcesReportClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getAdminReportOptions } from "@/lib/reports/adminReportOptions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type MissingResourcesPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function MissingResourcesReportPage({
  params,
}: MissingResourcesPageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const options = await getAdminReportOptions(access.tenant.tenantId);
        return (
          <AdminPageShell
            title={t("missingResourcesReport.page.title")}
            maxWidth="max-w-6xl"
          >
            <MissingResourcesReportClient
              tenant={tenant}
              centers={options.centers}
              tutors={options.tutors}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
