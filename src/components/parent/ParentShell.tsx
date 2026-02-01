"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";

import styles from "./parentTokens.module.css";
import PortalTopNav from "./PortalTopNav";

type ParentShellProps = {
  children: ReactNode;
  tenantLabel?: string;
  tenantSlug?: string;
  headerActions?: ReactNode;
  showNav?: boolean;
};

export default function ParentShell({
  children,
  tenantLabel,
  tenantSlug,
  headerActions,
  showNav = true,
}: ParentShellProps) {
  const params = useParams<{ tenant?: string }>();
  // Prefer the explicit tenant slug prop when passed from server layouts.
  const resolvedTenant =
    tenantSlug ?? (typeof params.tenant === "string" ? params.tenant : "");

  return (
    <div
      className={`${styles.parentPortal} min-h-screen bg-[var(--background)] text-[var(--text)]`}
      data-testid="parent-shell"
    >
      {/* Parent header is scoped so admin styles remain untouched. */}
      <header className="border-b border-[var(--border)]">
        <PortalTopNav
          tenantSlug={resolvedTenant}
          tenantLabel={tenantLabel}
          showNav={showNav}
          headerActions={headerActions}
        />
      </header>
      <main
        className="mx-auto w-full max-w-[960px] p-5 md:p-8"
        data-testid="parent-content"
      >
        {children}
      </main>
    </div>
  );
}
