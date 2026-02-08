"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import type { Role } from "@/generated/prisma/client";

type AdminNavProps = {
  tenant: string;
  userRole?: Role;
};

type AdminNavItem = {
  id: string;
  href: string;
  labelKey: string;
  activePrefixes?: string[];
};

export default function AdminNav({ tenant, userRole }: AdminNavProps) {
  const pathname = usePathname();
  const t = useTranslations();
  // UI-level guard keeps the audit link hidden for non-admin roles.
  const isAdmin = userRole === "Owner" || userRole === "Admin";

  // Core admin navigation items keep labels and routes consistent.
  const coreItems: AdminNavItem[] = [
    { id: "dashboard", href: `/${tenant}/admin`, labelKey: "nav.dashboard" },
    {
      id: "centers",
      href: `/${tenant}/admin/centers`,
      labelKey: "nav.centers",
    },
    { id: "users", href: `/${tenant}/admin/users`, labelKey: "nav.users" },
    {
      id: "catalog",
      href: `/${tenant}/admin/catalog`,
      labelKey: "nav.catalog",
      // Catalog stays active while navigating across catalog sub-pages.
      activePrefixes: [
        `/${tenant}/admin/catalog`,
        `/${tenant}/admin/subjects`,
        `/${tenant}/admin/levels`,
        `/${tenant}/admin/programs`,
      ],
    },
    // Students nav keeps roster management discoverable alongside core modules.
    { id: "students", href: `/${tenant}/admin/students`, labelKey: "nav.students" },
    { id: "groups", href: `/${tenant}/admin/groups`, labelKey: "nav.groups" },
    // Reports lives in the admin module list so staff can find operational dashboards quickly.
    {
      id: "reports",
      href: `/${tenant}/admin/reports`,
      labelKey: "nav.reports",
    },
    {
      id: "sessions",
      href: `/${tenant}/admin/sessions`,
      labelKey: "nav.sessions",
    },
    { id: "help", href: `/${tenant}/admin/help`, labelKey: "nav.help" },
  ];

  // Operations nav highlights audit-ready workflows for admin users.
  const operationsItems: AdminNavItem[] = [
    {
      id: "requests",
      href: `/${tenant}/admin/requests`,
      labelKey: "nav.requests",
    },
    ...(isAdmin
      ? [
          {
            id: "audit",
            href: `/${tenant}/admin/audit`,
            labelKey: "nav.audit",
          } satisfies AdminNavItem,
        ]
      : []),
  ];

  const reportItems: AdminNavItem[] = [
    {
      id: "reports-home",
      href: `/${tenant}/admin/reports`,
      labelKey: "admin.reports.nav.home",
    },
    {
      id: "reports-upcoming",
      href: `/${tenant}/admin/reports/upcoming-sessions`,
      labelKey: "admin.reports.nav.upcoming",
    },
    {
      id: "reports-attendance",
      href: `/${tenant}/admin/reports/attendance-summary`,
      labelKey: "admin.reports.nav.attendance",
    },
    {
      id: "reports-requests",
      href: `/${tenant}/admin/reports/absence-requests`,
      labelKey: "admin.reports.nav.requests",
    },
    {
      id: "reports-workload",
      href: `/${tenant}/admin/reports/tutor-workload`,
      labelKey: "admin.reports.nav.workload",
    },
    {
      id: "reports-students",
      href: `/${tenant}/admin/reports/students-directory`,
      labelKey: "admin.reports.nav.students",
    },
  ];
  const showReportItems = isAdmin;

  return (
    <div className="border-b border-slate-200 bg-white">
      <nav
        className="flex flex-col gap-2 px-4 py-3 text-sm sm:px-6"
        // Test id enables stable AdminNav selection without relying on text labels.
        data-testid="admin-nav"
      >
        <div className="flex flex-wrap items-center gap-3">
          {coreItems.map((item) => {
            // Dashboard uses exact matching; other sections use prefix matching.
            const isActive =
              item.id === "dashboard"
                ? pathname === item.href
                : item.activePrefixes
                  ? item.activePrefixes.some((prefix) =>
                      pathname.startsWith(prefix),
                    )
                  : pathname.startsWith(item.href);
            const linkClassName = isActive
              ? "rounded bg-slate-100 px-2 py-1 font-semibold text-slate-900"
              : "rounded px-2 py-1 text-slate-600 hover:text-slate-900";

            return (
              <Link
                key={item.id}
                className={linkClassName}
                href={item.href}
                // data-testid and aria-current keep active-link checks deterministic in E2E.
                data-testid={`nav-link-${item.id}`}
                aria-current={isActive ? "page" : undefined}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
        {operationsItems.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase text-slate-500">
              {t("nav.operations")}
            </span>
            {operationsItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const linkClassName = isActive
                ? "rounded bg-slate-100 px-2 py-1 font-semibold text-slate-900"
                : "rounded px-2 py-1 text-slate-600 hover:text-slate-900";
              return (
                <Link
                  key={item.id}
                  className={linkClassName}
                  href={item.href}
                  data-testid={`nav-link-${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        ) : null}
        {showReportItems ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase text-slate-500">
              {t("admin.reports.nav.title")}
            </span>
            {reportItems.map((item) => {
              const isActive =
                item.id === "reports-home"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              const linkClassName = isActive
                ? "rounded bg-slate-100 px-2 py-1 font-semibold text-slate-900"
                : "rounded px-2 py-1 text-slate-600 hover:text-slate-900";
              return (
                <Link
                  key={item.id}
                  className={linkClassName}
                  href={item.href}
                  data-testid={`nav-link-${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        ) : null}
      </nav>
    </div>
  );
}
