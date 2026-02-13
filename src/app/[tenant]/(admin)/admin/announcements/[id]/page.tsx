/**
 * @state.route /[tenant]/admin/announcements/[id]
 * @state.area admin
 * @state.capabilities view:detail, update:announcement
 * @state.notes Step 22.8 admin announcement detail/edit page.
 */
// Admin announcement detail page resolves tenant/id params and renders the shared editor client.
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
    id: string;
  }>;
};

export default async function AdminAnnouncementDetailPage({ params }: PageProps) {
  const t = await getTranslations();
  const { tenant, id } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {() => (
        <AdminPageShell
          title={t("adminAnnouncements.editTitle")}
          maxWidth="max-w-5xl"
          testId="admin-announcement-detail-page"
        >
          <AdminAnnouncementEditorClient
            tenant={tenant}
            announcementId={id}
          />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
