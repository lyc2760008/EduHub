/**
 * @state.route /[tenant]/admin/reports/homework-sla
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Step 23.2 admin homework SLA report page.
 */
// Admin homework SLA report page reuses admin access gate and report options for filter dropdowns.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import HomeworkSlaReportClient from "@/components/admin/reports/HomeworkSlaReportClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getAdminReportOptions } from "@/lib/reports/adminReportOptions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function HomeworkSlaReportPage({ params }: PageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const options = await getAdminReportOptions(access.tenant.tenantId);

        return (
          <AdminPageShell
            title={t("homeworkReport.page.title")}
            subtitle={t("homeworkReport.page.subtitle")}
            maxWidth="max-w-6xl"
            testId="admin-homework-sla-page"
          >
            <HomeworkSlaReportClient
              tenant={tenant}
              tutors={options.tutors}
              centers={options.centers}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
