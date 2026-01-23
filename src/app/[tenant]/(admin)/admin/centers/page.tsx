// Admin centers page that loads tenant-scoped data and delegates UI to a client component.
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import type { Role } from "@/generated/prisma/client";
import CentersClient from "@/components/admin/centers/CentersClient";
import { getCenters } from "@/lib/centers/getCenters";
import { requirePageRole } from "@/lib/rbac/page";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

export default async function CentersPage({ params }: PageProps) {
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
        className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-6 py-10"
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

  // Tenant-scoped fetch keeps centers isolated per tenant.
  const centers = await getCenters(access.ctx.tenant.tenantId, {
    includeInactive: true,
  });

  return (
    <div
      className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10"
      data-testid="centers-page"
    >
      <h1 className="text-2xl font-semibold">{t("admin.centers.title")}</h1>
      <CentersClient initialCenters={centers} />
    </div>
  );
}
