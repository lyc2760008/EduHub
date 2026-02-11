/**
 * @state.route /[tenant]/admin/reports/upcoming-sessions
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import UpcomingSessionsReportClient from "@/components/admin/reports/UpcomingSessionsReportClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getAdminReportOptions } from "@/lib/reports/adminReportOptions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type UpcomingSessionsPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function UpcomingSessionsPage({
  params,
}: UpcomingSessionsPageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const options = await getAdminReportOptions(access.tenant.tenantId);
        return (
          <AdminPageShell
            title={t("admin.reports.upcoming.title")}
            subtitle={t("admin.reports.upcoming.helper")}
            maxWidth="max-w-6xl"
          >
            <UpcomingSessionsReportClient
              tenant={tenant}
              tutors={options.tutors}
              groups={options.groups}
              centers={options.centers}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
