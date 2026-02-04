// Admin audit log page that wraps the client list with RBAC and tenant-aware shell.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import AuditLogClient from "@/components/admin/audit/AuditLogClient";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AuditLogPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {() => (
        <AdminPageShell
          title={t("admin.audit.title")}
          subtitle={t("admin.audit.helper")}
          maxWidth="max-w-6xl"
          testId="audit-log-page"
        >
          <AuditLogClient />
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
