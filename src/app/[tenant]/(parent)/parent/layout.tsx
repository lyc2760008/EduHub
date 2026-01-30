import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import ParentShell from "@/components/parent/ParentShell";
import { requireParentAccess } from "@/lib/rbac/parent";

type ParentLayoutProps = {
  children: ReactNode;
  params: Promise<{
    tenant: string;
  }>;
};

export default async function ParentLayout({
  children,
  params,
}: ParentLayoutProps) {
  // Enforce parent-only access on the server to protect portal routes.
  const { tenant } = await params;
  const access = await requireParentAccess(tenant);

  if (!access.ok) {
    if (access.status === 400 || access.status === 404) {
      notFound();
    }

    redirect(`/${tenant}/parent/login`);
  }

  return (
    <ParentShell>
      {/* Parent shell scopes portal styling so admin remains unchanged. */}
      {children}
    </ParentShell>
  );
}
