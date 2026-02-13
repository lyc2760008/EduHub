/**
 * @state.route /[tenant]/admin/announcements/engagement
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Step 22.8 announcement engagement report page with CSV export.
 */
// Announcement engagement report page binds the admin report client to Owner/Admin RBAC.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAnnouncementsEngagementClient from "@/components/admin/announcements/AdminAnnouncementsEngagementClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AdminAnnouncementEngagementPage({
  params,
}: PageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {() => (
        <AdminPageShell
          title={t("announcementsReport.page.title")}
          maxWidth="max-w-6xl"
          testId="admin-announcements-engagement-page"
        >
          <AdminAnnouncementsEngagementClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
