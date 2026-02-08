import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import TutorWorkloadReportClient from "@/components/admin/reports/TutorWorkloadReportClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getAdminReportOptions } from "@/lib/reports/adminReportOptions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type TutorWorkloadPageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TutorWorkloadPage({
  params,
}: TutorWorkloadPageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const options = await getAdminReportOptions(access.tenant.tenantId);
        return (
          <AdminPageShell
            title={t("admin.reports.workload.title")}
            subtitle={t("admin.reports.workload.helper")}
            maxWidth="max-w-6xl"
          >
            <TutorWorkloadReportClient
              tenant={tenant}
              groups={options.groups}
              centers={options.centers}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
