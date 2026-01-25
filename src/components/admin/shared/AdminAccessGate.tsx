// Server-side admin access gate that enforces RBAC and renders a localized denied state.
// Wrap admin page content with this component and pass a render function for protected content.
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import type { Role } from "@/generated/prisma/client";
import { requirePageRole } from "@/lib/rbac/page";

export type AdminAccessGateProps = {
  tenant: string;
  roles: Role[];
  children: (ctx: AdminAccessContext) => ReactNode | Promise<ReactNode>;
  maxWidth?: string;
  testId?: string;
};

type RequirePageRoleResult = Awaited<ReturnType<typeof requirePageRole>>;
export type AdminAccessContext = Extract<
  RequirePageRoleResult,
  { ok: true }
>["ctx"];

const DEFAULT_MAX_WIDTH = "max-w-5xl";
const DEFAULT_TEST_ID = "access-denied";

export default async function AdminAccessGate({
  tenant,
  roles,
  children,
  maxWidth = DEFAULT_MAX_WIDTH,
  testId = DEFAULT_TEST_ID,
}: AdminAccessGateProps) {
  // i18n: keep access denied content server-localized.
  const t = await getTranslations();
  // RBAC runs on the server to avoid UI-only access checks.
  const access = await requirePageRole(tenant, roles);

  if (!access.ok) {
    // Redirect unauthenticated users while keeping a denied UI for forbidden roles.
    if (access.status === 401) {
      redirect(`/${tenant}/login`);
    }

    return (
      <div
        className={`mx-auto flex min-h-screen ${maxWidth} flex-col gap-4 px-6 py-10`}
        data-testid={testId}
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

  // Render-prop keeps the gate server-only while sharing tenant-aware context.
  const content = await children(access.ctx);
  return <>{content}</>;
}
