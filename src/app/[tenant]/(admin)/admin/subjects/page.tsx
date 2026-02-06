// Admin subjects page that relies on shared RBAC gate + shell and delegates UI to a client component.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import SubjectsClient from "@/components/admin/subjects/SubjectsClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function SubjectsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {async (access) => {
        const tenantId = access.tenant.tenantId;
        // Tenant-scoped initial load keeps client render fast and isolated.
        const subjects = await prisma.subject.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
        });

        return (
          <AdminPageShell
            title={t("admin.subjects.title")}
            maxWidth="max-w-5xl"
            testId="subjects-page"
          >
            <SubjectsClient initialSubjects={subjects} tenant={tenant} />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
