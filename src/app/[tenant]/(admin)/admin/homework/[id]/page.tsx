/**
 * @state.route /[tenant]/admin/homework/[id]
 * @state.area admin
 * @state.capabilities view:detail, create:homework_file, update:bulk_mark_reviewed
 * @state.notes Step 23.2 admin homework review detail page.
 */
// Admin homework detail page renders the shared staff detail UI behind owner/admin page guard.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminHomeworkDetailClient from "@/components/admin/homework/AdminHomeworkDetailClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{ tenant: string; id: string }>;
};

export default async function AdminHomeworkDetailPage({ params }: PageProps) {
  const t = await getTranslations();
  const { tenant, id } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {() => (
        <AdminPageShell
          title={t("staffHomework.detail.title")}
          subtitle={t("staffHomework.detail.subtitle")}
          maxWidth="max-w-5xl"
          testId="admin-homework-detail-page"
        >
          <AdminHomeworkDetailClient tenant={tenant} homeworkItemId={id} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
