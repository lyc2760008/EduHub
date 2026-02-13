/**
 * @state.route /[tenant]/admin/homework
 * @state.area admin
 * @state.capabilities view:list, update:bulk_mark_reviewed, create:homework_file
 * @state.notes Step 23.2 admin homework review queue page.
 */
// Admin homework queue page wires owner/admin access and shared queue UI with report filter options.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminHomeworkQueueClient from "@/components/admin/homework/AdminHomeworkQueueClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { getAdminReportOptions } from "@/lib/reports/adminReportOptions";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function AdminHomeworkQueuePage({ params }: PageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async (access) => {
        const options = await getAdminReportOptions(access.tenant.tenantId);

        return (
          <AdminPageShell
            title={t("staffHomework.queue.title")}
            subtitle={t("staffHomework.queue.subtitle")}
            maxWidth="max-w-6xl"
            testId="admin-homework-queue-page"
          >
            <AdminHomeworkQueueClient
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
