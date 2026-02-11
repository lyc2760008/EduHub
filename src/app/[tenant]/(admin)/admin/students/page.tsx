/**
 * @state.route /[tenant]/admin/students
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Students admin list page using shared access gate + shell.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import StudentsClient from "@/components/admin/students/StudentsClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function StudentsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {() => (
        <AdminPageShell
          title={t("admin.students.title")}
          maxWidth="max-w-6xl"
          testId="students-page"
        >
          <StudentsClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
