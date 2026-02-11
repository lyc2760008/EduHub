/**
 * @state.route /[tenant]/admin/reports/attendance-summary
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AttendanceSummaryReportClient from "@/components/admin/reports/AttendanceSummaryReportClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getAdminReportOptions } from "@/lib/reports/adminReportOptions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type AttendanceSummaryPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function AttendanceSummaryPage({
  params,
}: AttendanceSummaryPageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const options = await getAdminReportOptions(access.tenant.tenantId);
        return (
          <AdminPageShell
            title={t("admin.reports.attendance.title")}
            subtitle={t("admin.reports.attendance.helper")}
            maxWidth="max-w-6xl"
          >
            <AttendanceSummaryReportClient
              tenant={tenant}
              groups={options.groups}
              tutors={options.tutors}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
