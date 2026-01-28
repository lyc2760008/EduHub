// Admin dashboard page that uses shared admin gate + shell for consistent RBAC and layout.
import { getTranslations } from "next-intl/server";

import AdminDashboardClient from "@/components/admin/dashboard/AdminDashboardClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";
import type { Role } from "@/generated/prisma/client";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AdminPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-3xl">
      {(access) => {
        // RBAC context from AdminAccessGate keeps tenant data scoped and available.
        void access;

        return (
          <AdminPageShell
            title={t("admin.dashboard.title")}
            maxWidth="max-w-6xl"
            // Keep app-shell for shared login helper, and use a child test id for dashboard-specific checks.
            testId="app-shell"
          >
            {/* Client widget layer keeps API fetching fast without bloating the server page. */}
            <AdminDashboardClient tenant={tenant} />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
