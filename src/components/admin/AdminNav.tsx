// Admin nav groups highlight Step 21.4B list pages (People/Setup/Operations) while keeping core links visible.
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

  // Core admin navigation keeps essentials visible for all staff roles.
  const coreItems: AdminNavItem[] = [
    { id: "dashboard", href: `/${tenant}/admin`, labelKey: "nav.dashboard" },
    { id: "students", href: `/${tenant}/admin/students`, labelKey: "nav.students" },
    { id: "requests", href: `/${tenant}/admin/requests`, labelKey: "nav.requests" },
    {
      id: "reports",
      href: `/${tenant}/admin/reports`,
      labelKey: "admin.nav.reports",
    },
    { id: "sessions", href: `/${tenant}/admin/sessions`, labelKey: "nav.sessions" },
    { id: "centers", href: `/${tenant}/admin/centers`, labelKey: "nav.centers" },
    { id: "help", href: `/${tenant}/admin/help`, labelKey: "nav.help" },
    { id: "catalog", href: `/${tenant}/admin/catalog`, labelKey: "nav.catalog" },
  ];

  const peopleItems: AdminNavItem[] = isAdmin
    ? [
        {
          id: "parents",
          href: `/${tenant}/admin/parents`,
          labelKey: "admin.nav.parents",
        },
        {
          id: "staff",
          href: `/${tenant}/admin/users`,
          labelKey: "admin.nav.staff",
        },
      ]
    : [];

  // Setup doubles as the academics grouping for groups/classes + curriculum setup.
  const setupItems: AdminNavItem[] = isAdmin
    ? [
        {
          id: "groups",
          href: `/${tenant}/admin/groups`,
          labelKey: "admin.nav.groups",
        },
        {
          id: "programs",
          href: `/${tenant}/admin/programs`,
          labelKey: "admin.nav.programs",
        },
        {
          id: "subjects",
          href: `/${tenant}/admin/subjects`,
          labelKey: "admin.nav.subjects",
        },
        {
          id: "levels",
          href: `/${tenant}/admin/levels`,
          labelKey: "admin.nav.levels",
        },
      ]
    : [];

  // Operations/System nav highlights audit-ready workflows for admin users.
  const operationsItems: AdminNavItem[] = isAdmin
    ? [
        {
          id: "audit",
          href: `/${tenant}/admin/audit`,
          labelKey: "admin.nav.audit",
        },
      ]
    : [];

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
        {peopleItems.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase text-slate-500">
              {t("admin.nav.people")}
            </span>
            {peopleItems.map((item) => {
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
        {setupItems.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase text-slate-500">
              {t("admin.nav.setup")}
            </span>
            {setupItems.map((item) => {
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
        {operationsItems.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase text-slate-500">
              {t("admin.nav.operations")}
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
