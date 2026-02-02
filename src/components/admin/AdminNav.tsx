"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

type AdminNavProps = {
  tenant: string;
};

type AdminNavItem = {
  id: string;
  href: string;
  labelKey: string;
  activePrefixes?: string[];
};

export default function AdminNav({ tenant }: AdminNavProps) {
  const pathname = usePathname();
  const t = useTranslations();

  // Centralized admin navigation items keep labels and routes consistent.
  const navItems: AdminNavItem[] = [
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
    // Requests inbox lives alongside other operational modules.
    {
      id: "requests",
      href: `/${tenant}/admin/requests`,
      labelKey: "nav.requests",
    },
  ];

  return (
    <div className="border-b border-slate-200 bg-white">
      <nav
        className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-6"
        // Test id enables stable AdminNav selection without relying on text labels.
        data-testid="admin-nav"
      >
        {navItems.map((item) => {
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
      </nav>
    </div>
  );
}
