/**
 * @state.route /[tenant]/admin/reports/notifications-engagement
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Step 23.3 admin notifications engagement report page.
 */
// Admin notifications report page reuses admin access gate and aggregate-only report client.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import NotificationsEngagementReportClient from "@/components/admin/reports/NotificationsEngagementReportClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function NotificationsEngagementReportPage({
  params,
}: PageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {() => (
        <AdminPageShell
          title={t("adminNotificationsReport.page.title")}
          subtitle={t("adminNotificationsReport.page.subtitle")}
          maxWidth="max-w-6xl"
          testId="admin-notifications-engagement-page"
        >
          <NotificationsEngagementReportClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
