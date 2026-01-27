// Admin dashboard page that uses shared admin gate + shell for consistent RBAC and layout.
import { getTranslations } from "next-intl/server";
import Link from "next/link";

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
        // RBAC context from AdminAccessGate keeps user data scoped to the tenant.
        const email = access.user.email ?? "";

        return (
          <AdminPageShell
            title={t("admin.title")}
            maxWidth="max-w-3xl"
            testId="app-shell"
          >
            {/* nav.* keeps admin quick links aligned with the design-system namespace. */}
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-centers"
              href={`/${tenant}/admin/centers`}
            >
              {t("nav.admin.centers")}
            </Link>
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-subjects"
              href={`/${tenant}/admin/subjects`}
            >
              {t("nav.admin.subjects")}
            </Link>
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-levels"
              href={`/${tenant}/admin/levels`}
            >
              {t("nav.admin.levels")}
            </Link>
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-programs"
              href={`/${tenant}/admin/programs`}
            >
              {t("nav.admin.programs")}
            </Link>
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-groups"
              href={`/${tenant}/admin/groups`}
            >
              {t("nav.admin.groups")}
            </Link>
            {/* Sessions navigation keeps scheduling workflows reachable from the admin home. */}
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-sessions"
              href={`/${tenant}/admin/sessions`}
            >
              {t("nav.admin.sessions")}
            </Link>
            {/* Admin navigation includes Users for staff and role management. */}
            <Link
              className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              data-testid="nav-admin-users"
              href={`/${tenant}/admin/users`}
            >
              {t("nav.admin.users")}
            </Link>
            <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
              {t("admin.welcome", { email })}
            </div>
          </AdminPageShell>
        );
      }}
    </AdminAccessGate>
  );
}
