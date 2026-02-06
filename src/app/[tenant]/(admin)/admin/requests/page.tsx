// Admin requests inbox page that uses the shared RBAC gate + admin shell layout.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import RequestsClient from "@/components/admin/requests/RequestsClient";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function RequestsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {async () => (
        <AdminPageShell
          title={t("admin.requests.title")}
          maxWidth="max-w-6xl"
          testId="requests-page"
        >
          <RequestsClient tenant={tenant} />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
