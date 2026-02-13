/**
 * @state.route /[tenant]/admin/announcements
 * @state.area admin
 * @state.capabilities view:list, create:announcement, update:announcement
 * @state.notes Step 22.8 admin announcements list page with server-side RBAC and table toolkit integration.
 */
// Admin announcements list page wires access gating and shell layout around the announcements list client.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAnnouncementsListClient from "@/components/admin/announcements/AdminAnnouncementsListClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AdminAnnouncementsPage({ params }: PageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {() => (
        <AdminPageShell
          title={t("adminAnnouncements.page.title")}
          subtitle={t("adminAnnouncements.page.subtitle")}
          maxWidth="max-w-6xl"
          testId="admin-announcements-page"
        >
          <AdminAnnouncementsListClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
