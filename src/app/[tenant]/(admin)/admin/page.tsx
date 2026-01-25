// Minimal admin stub guarded by server-side RBAC with access denied fallback.
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import type { Role } from "@/generated/prisma/client";
import { requirePageRole } from "@/lib/rbac/page";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AdminPage({ params }: PageProps) {
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;

  // Redirect to login when unauthenticated; otherwise show access denied UI.
  const access = await requirePageRole(tenant, ADMIN_ROLES);
  if (!access.ok) {
    if (access.status === 401) {
      redirect(`/${tenant}/login`);
    }

    return (
      <div
        className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-10"
        data-testid="access-denied"
      >
        <h1 className="text-2xl font-semibold">
          {t("admin.accessDenied.title")}
        </h1>
        <p className="text-sm text-slate-600">
          {t("admin.accessDenied.message")}
        </p>
      </div>
    );
  }

  const email = access.ctx.user.email ?? "";

  return (
    <div
      className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-10"
      data-testid="app-shell"
    >
      <h1 className="text-2xl font-semibold">{t("admin.title")}</h1>
      <Link
        className="text-sm font-semibold text-slate-700 underline underline-offset-4"
        data-testid="nav-admin-centers"
        href={`/${tenant}/admin/centers`}
      >
        {t("admin.centers.title")}
      </Link>
      {/* Admin navigation includes Users for staff and role management. */}
      <Link
        className="text-sm font-semibold text-slate-700 underline underline-offset-4"
        data-testid="nav-admin-users"
        href={`/${tenant}/admin/users`}
      >
        {t("admin.users.title")}
      </Link>
      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {t("admin.welcome", { email })}
      </div>
    </div>
  );
}
