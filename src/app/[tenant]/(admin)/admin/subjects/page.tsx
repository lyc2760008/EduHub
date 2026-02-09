// Admin subjects page that uses shared admin table toolkit contracts.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import SubjectsClient from "@/components/admin/subjects/SubjectsClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

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
      {() => (
        <AdminPageShell
          title={t("admin.subjectsList.title")}
          subtitle={t("admin.subjectsList.helper")}
          maxWidth="max-w-5xl"
          testId="subjects-page"
        >
          <SubjectsClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
