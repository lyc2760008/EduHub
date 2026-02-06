// Student detail page with server-side RBAC gate and client editor.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import StudentDetailClient from "@/components/admin/students/StudentDetailClient";
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

export default async function StudentDetailPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant, id } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {() => (
        <AdminPageShell
          title={t("admin.students.detail.title")}
          maxWidth="max-w-5xl"
          testId="student-detail-page"
        >
          <StudentDetailClient studentId={id} tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
