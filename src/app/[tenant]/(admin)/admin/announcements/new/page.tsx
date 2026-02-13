/**
 * @state.route /[tenant]/admin/announcements/new
 * @state.area admin
 * @state.capabilities create:announcement
 * @state.notes Step 22.8 admin announcement create page (draft save + publish + archive actions).
 */
// Admin announcement create page wraps the shared editor client with Owner/Admin RBAC.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAnnouncementEditorClient from "@/components/admin/announcements/AdminAnnouncementEditorClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AdminAnnouncementCreatePage({ params }: PageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {() => (
        <AdminPageShell
          title={t("adminAnnouncements.create")}
          maxWidth="max-w-5xl"
          testId="admin-announcement-create-page"
        >
          <AdminAnnouncementEditorClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
