// Admin layout now uses the modern AdminShell and enforces RBAC before rendering navigation.
import type { ReactNode } from "react";

import AdminShell from "@/components/admin/shell/AdminShell";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import type { Role } from "@/generated/prisma/client";

type AdminLayoutProps = {
  children: ReactNode;
  params: Promise<{
    tenant: string;
  }>;
};

const ADMIN_SHELL_ROLES: Role[] = ["Owner", "Admin", "Tutor"];

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  // Next.js 16 may supply route params as a Promise in server layouts.
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_SHELL_ROLES} maxWidth="max-w-5xl">
      {(access) => (
        <AdminShell
          tenant={tenant}
          // RBAC context from AdminAccessGate keeps nav visibility aligned with server access.
          userRole={access.membership.role}
          userId={access.user.id}
        >
          {children}
        </AdminShell>
      )}
    </AdminAccessGate>
  );
}
