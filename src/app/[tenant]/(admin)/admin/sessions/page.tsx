// Admin/tutor sessions page that uses the shared access gate and a client list view.
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import SessionsClient from "@/components/admin/sessions/SessionsClient";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const READ_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function SessionsPage({ params }: PageProps) {
  // i18n: resolve admin copy on the server to stay locale-correct.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={READ_ROLES} maxWidth="max-w-6xl">
      {(access) => {
        const viewerLabel =
          access.user.name ?? access.user.email ?? access.user.id;

        return (
          <AdminPageShell
            title={t("admin.sessions.title")}
            maxWidth="max-w-6xl"
            // Stable test id keeps sessions list checks deterministic in E2E.
            testId="sessions-list-page"
          >
            <SessionsClient
              tenant={tenant}
              viewerId={access.user.id}
              viewerLabel={viewerLabel}
              viewerRole={access.membership.role}
            />
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
