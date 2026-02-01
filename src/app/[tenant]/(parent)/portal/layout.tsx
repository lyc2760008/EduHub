import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import ParentShell from "@/components/parent/ParentShell";
import { requireParentAccess } from "@/lib/rbac/parent";

type PortalLayoutProps = {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
};

export default async function PortalLayout({
  children,
  params,
}: PortalLayoutProps) {
  // Enforce parent-only access on portal routes before rendering any UI.
  const { tenant } = await params;
  const access = await requireParentAccess(tenant);

  if (!access.ok) {
    if (access.status === 400 || access.status === 404) {
      notFound();
    }

    redirect(`/${tenant}/parent/login`);
  }

  return (
    <ParentShell tenantLabel={access.ctx.tenant.tenantName}>
      {/* ParentShell scopes portal styling so admin remains unchanged. */}
      {children}
    </ParentShell>
  );
}

