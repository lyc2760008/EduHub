// Minimal admin stub guarded by server-side RBAC.
import { getTranslations } from "next-intl/server";
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

  // Redirect to login when not authorized for this tenant.
  const ctx = await requirePageRole(tenant, ADMIN_ROLES);
  if (!ctx) {
    redirect(`/${tenant}/login`);
  }

  const email = ctx.user.email ?? "";

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold">{t("admin.title")}</h1>
      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {t("admin.welcome", { email })}
      </div>
    </div>
  );
}
