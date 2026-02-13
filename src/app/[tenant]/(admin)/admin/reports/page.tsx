/**
 * @state.route /[tenant]/admin/reports
 * @state.area admin
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { Role } from "@/generated/prisma/client";
import AdminAccessGate from "@/components/admin/shared/AdminAccessGate";
import AdminPageShell from "@/components/admin/shared/AdminPageShell";

export const runtime = "nodejs";

const ADMIN_ROLES: Role[] = ["Owner", "Admin"];

type ReportsPageProps = {
  params: Promise<{
    tenant: string;
  }>;
};

type ReportCardConfig = {
  id:
    | "upcoming"
    | "attendance"
    | "requests"
    | "workload"
    | "students"
    | "announcementEngagement";
  href: string;
};

const REPORT_CARDS: ReportCardConfig[] = [
  { id: "upcoming", href: "upcoming-sessions" },
  { id: "attendance", href: "attendance-summary" },
  { id: "requests", href: "absence-requests" },
  { id: "workload", href: "tutor-workload" },
  { id: "students", href: "students-directory" },
  // Step 22.8 engagement report lives in the announcements route namespace.
  { id: "announcementEngagement", href: "/admin/announcements/engagement" },
];

export default async function ReportsIndexPage({ params }: ReportsPageProps) {
  const t = await getTranslations();
  const { tenant } = await params;

  return (
    <AdminAccessGate tenant={tenant} roles={ADMIN_ROLES} maxWidth="max-w-6xl">
      {() => (
        <AdminPageShell
          title={t("admin.reports.index.title")}
          subtitle={t("admin.reports.index.helper")}
          maxWidth="max-w-6xl"
          testId="reports-page"
        >
          <p className="text-sm text-slate-600">{t("admin.reports.index.note")}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {REPORT_CARDS.map((card) => (
              <article
                key={card.id}
                className="flex h-full flex-col gap-3 rounded border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    {t(`admin.reports.${card.id}.title`)}
                  </h2>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    {t(`admin.reports.${card.id}.defaultRange`)}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {t(`admin.reports.${card.id}.helper`)}
                </p>
                <div className="mt-auto">
                  <Link
                    href={
                      card.href.startsWith("/")
                        ? `/${tenant}${card.href}`
                        : `/${tenant}/admin/reports/${card.href}`
                    }
                    className="inline-flex items-center rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {t("admin.reports.index.openReport")}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </AdminPageShell>
      )}
    </AdminAccessGate>
  );
}
