// Admin parents page that uses the shared list shell + table toolkit for consistency.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import ParentsClient from "@/components/admin/parents/ParentsClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function ParentsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-5xl">
      {() => (
        <AdminPageShell
          title={t("admin.parentsList.title")}
          subtitle={t("admin.parentsList.helper")}
          maxWidth="max-w-5xl"
          testId="parents-page"
        >
          <ParentsClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
