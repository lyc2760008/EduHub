import type { ReactNode } from "react";

import AdminNav from "@/components/admin/AdminNav";

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

  return (
    <>
      {/* Global admin navigation keeps section links consistent across pages. */}
      <AdminNav tenant={tenant} />
      {children}
    </>
  );
}
