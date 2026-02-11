// Tutor route layout enforces tutor-only RBAC before rendering tutor pages.
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import TutorShell from "@/components/tutor/TutorShell";
import { requireTutorContextOrThrow, TutorAccessError } from "@/lib/tutor/guard";

type TutorLayoutProps = {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
};

export default async function TutorLayout({
  children,
  params,
}: TutorLayoutProps) {
  const { tenant } = await params;
  const t = await getTranslations();
  let tutorCtx: Awaited<ReturnType<typeof requireTutorContextOrThrow>> | null =
    null;
  let accessError: TutorAccessError | null = null;

  try {
    tutorCtx = await requireTutorContextOrThrow(tenant);
  } catch (error) {
    if (error instanceof TutorAccessError) {
      accessError = error;
    } else {
      throw error;
    }
  }

  if (accessError?.status === 401) {
    redirect(`/${tenant}/login`);
  }

  if (accessError?.status === 404) {
    notFound();
  }

  if (accessError?.status === 403) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-3xl flex-col gap-3 rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {t("admin.accessDenied.title")}
        </h1>
        <p className="text-sm text-slate-600">
          {t("admin.accessDenied.message")}
        </p>
      </div>
    );
  }

  if (!tutorCtx) {
    notFound();
  }

  return (
    <TutorShell tenant={tenant} tenantLabel={tutorCtx.tenant.tenantName}>
      {children}
    </TutorShell>
  );
}
