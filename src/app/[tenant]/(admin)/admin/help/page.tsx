// Admin help page renders the MMC quick start for staff.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];
const QUICK_START_PATH = path.join(
  process.cwd(),
  "docs",
  "pilot",
  "mmc-admin-quick-start.md",
);

type PageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

async function loadQuickStart() {
  try {
    return await readFile(QUICK_START_PATH, "utf8");
  } catch {
    // Missing quick start content should fall back to the localized empty state.
    return null;
  }
}

export default async function AdminHelpPage({ params }: PageProps) {
  // i18n: resolve strings on the server for the current locale.
  const t = await getTranslations();
  // Next.js 16 may supply dynamic params as a Promise in server components.
  const { tenant } = await params;
  const quickStart = await loadQuickStart();

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES}>
      {async () => (
        <AdminPageShell
          title={t("nav.help")}
          subtitle={t("admin.help.subtitle")}
          maxWidth="max-w-5xl"
          testId="admin-help-page"
        >
          {quickStart ? (
            <div
              className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-700"
              data-testid="admin-help-quick-start"
            >
              {quickStart}
            </div>
          ) : (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              data-testid="admin-help-missing"
            >
              {t("admin.help.missing")}
            </div>
          )}
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
