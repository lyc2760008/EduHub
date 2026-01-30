import type { ReactNode } from "react";

import ParentShell from "@/components/parent/ParentShell";

type ParentLayoutProps = {
  children: ReactNode;
};

export default function ParentLayout({ children }: ParentLayoutProps) {
  return (
    <ParentShell>
      {/* Parent shell scopes portal styling so admin remains unchanged. */}
      {children}
    </ParentShell>
  );
}
