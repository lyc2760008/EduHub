import type { ReactNode } from "react";

import AdminNav from "@/components/admin/AdminNav";
import { auth } from "@/lib/auth";

type AdminLayoutProps = {
  children: ReactNode;
  params: Promise<{
    tenant: string;
  }>;
};

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  // Next.js 16 may supply route params as a Promise in server layouts.
  const { tenant } = await params;
  // Resolve the current user role server-side so client nav can avoid useSession.
  const session = await auth();
  const userRole = session?.user?.role;

  return (
    <>
      {/* Global admin navigation keeps section links consistent across pages. */}
      <AdminNav tenant={tenant} userRole={userRole} />
      {children}
    </>
  );
}
