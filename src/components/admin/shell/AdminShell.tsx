// AdminShell renders the modern sidebar + top bar layout with RBAC-aware nav.
"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { Role } from "@/generated/prisma/client";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_TOP_ITEMS,
  getAdminNavGroupIds,
  type AdminNavGroup,
  type AdminNavItem,
} from "@/lib/nav/adminNavTree";

type AdminShellProps = {
  tenant: string;
  userRole?: Role;
  userId?: string;
  children: ReactNode;
};

type PersistedNavState = {
  collapsed: boolean;
  openGroups: string[];
};

const SIDEBAR_WIDTH_EXPANDED = "w-[260px]";
const SIDEBAR_WIDTH_COLLAPSED = "w-[72px]";
const TOPBAR_HEIGHT = "h-14";

const NAV_ICON_STYLES =
  "flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600";

const NAV_ITEM_BASE =
  "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

const NAV_ITEM_ACTIVE =
  "bg-amber-50 text-slate-900 ring-1 ring-amber-200";

const NAV_ITEM_ACTIVE_BAR =
  "before:absolute before:left-0 before:h-6 before:w-1 before:rounded-full before:bg-amber-500";

const NAV_GROUP_LABEL =
  "text-xs font-semibold uppercase tracking-wide text-slate-500";

function getNormalizedAdminPath(pathname: string, tenant: string) {
  if (!pathname) return "/admin";
  return pathname.startsWith(`/${tenant}`)
    ? pathname.replace(`/${tenant}`, "")
    : pathname;
}

function isNavItemActive(item: AdminNavItem, path: string) {
  if (item.match === "exact") return path === item.href;
  if (item.match === "prefix") {
    return path === item.href || path.startsWith(`${item.href}/`);
  }
  return false;
}

function canSeeNavItem(role: Role | undefined, item: AdminNavItem) {
  if (!role) return false;
  return item.roles.includes(role);
}

function filterGroupsByRole(role: Role | undefined, groups: AdminNavGroup[]) {
  if (!role) return [];
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeNavItem(role, item)),
    }))
    .filter((group) => group.items.length > 0);
}

function filterItemsByRole(role: Role | undefined, items: AdminNavItem[]) {
  if (!role) return [];
  return items.filter((item) => canSeeNavItem(role, item));
}

function useAdminNavState(
  tenant: string,
  userId: string | undefined,
  groupIds: string[],
) {
  const storageKey = useMemo(() => {
    const identity = userId ?? "session";
    return `admin-nav:${tenant}:${identity}`;
  }, [tenant, userId]);

  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(groupIds);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (!groupIds.length) return;
    const readStorage = () => {
      if (typeof window === "undefined") return null;
      try {
        if (userId) return window.localStorage.getItem(storageKey);
        return window.sessionStorage.getItem(storageKey);
      } catch {
        return null;
      }
    };
    const raw = readStorage();
    if (!raw) {
      setOpenGroups(groupIds);
      hasHydrated.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PersistedNavState;
      const nextGroups = parsed.openGroups.filter((id) => groupIds.includes(id));
      setCollapsed(Boolean(parsed.collapsed));
      setOpenGroups(nextGroups.length ? nextGroups : groupIds);
    } catch {
      setOpenGroups(groupIds);
    } finally {
      hasHydrated.current = true;
    }
  }, [groupIds, storageKey, userId]);

  useEffect(() => {
    if (!hasHydrated.current) return;
    const payload: PersistedNavState = {
      collapsed,
      openGroups,
    };
    try {
      if (typeof window === "undefined") return;
      if (userId) {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } else {
        window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage failures to keep navigation functional.
    }
  }, [collapsed, openGroups, storageKey, userId]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }, []);

  const ensureGroupOpen = useCallback((groupId: string | null) => {
    if (!groupId) return;
    setOpenGroups((prev) =>
      prev.includes(groupId) ? prev : [...prev, groupId],
    );
  }, []);

  return {
    collapsed,
    openGroups,
    toggleCollapsed,
    toggleGroup,
    ensureGroupOpen,
  };
}

function buildReportCrumb(path: string, tenant: string) {
  const reportMap: Record<string, { labelKey: string; titleKey: string }> = {
    "/admin/reports/upcoming-sessions": {
      labelKey: "admin.nav.report.upcomingSessions",
      titleKey: "admin.reports.upcoming.title",
    },
    "/admin/reports/attendance-summary": {
      labelKey: "admin.nav.report.attendanceSummary",
      titleKey: "admin.reports.attendance.title",
    },
    "/admin/reports/absence-requests": {
      labelKey: "admin.nav.report.absenceRequests",
      titleKey: "admin.reports.requests.title",
    },
    "/admin/reports/tutor-workload": {
      labelKey: "admin.nav.report.tutorWorkload",
      titleKey: "admin.reports.workload.title",
    },
    "/admin/reports/students-directory": {
      labelKey: "admin.nav.report.studentsDirectory",
      titleKey: "admin.reports.students.title",
    },
    "/admin/announcements/engagement": {
      labelKey: "admin.nav.report.announcementEngagement",
      titleKey: "announcementsReport.page.title",
    },
  };

  const entry = reportMap[path];
  if (!entry) return null;
  return {
    titleKey: entry.titleKey,
    breadcrumbs: [
      { labelKey: "admin.nav.reportsHome", href: `/${tenant}/admin/reports` },
      { labelKey: entry.labelKey },
    ],
  };
}

function resolvePageMeta(
  path: string,
  tenant: string,
  t: (key: string, values?: Record<string, string>) => string,
  items: AdminNavItem[],
) {
  const reportMeta = buildReportCrumb(path, tenant);
  if (reportMeta) {
    return {
      title: t(reportMeta.titleKey),
      breadcrumbs: reportMeta.breadcrumbs.map((crumb) => ({
        label: t(crumb.labelKey),
        href: crumb.href,
      })),
    };
  }

  const detailMatchers: Array<{
    match: RegExp;
    titleKey: string;
    parentLabelKey: string;
    parentHref: string;
  }> = [
    {
      match: /^\/admin\/students\/[^/]+$/,
      titleKey: "admin.students.detail.title",
      parentLabelKey: "admin.nav.students",
      parentHref: `/${tenant}/admin/students`,
    },
    {
      match: /^\/admin\/groups\/[^/]+$/,
      titleKey: "admin.groups.detailTitle",
      parentLabelKey: "admin.nav.groups",
      parentHref: `/${tenant}/admin/groups`,
    },
    {
      match: /^\/admin\/sessions\/[^/]+$/,
      titleKey: "admin.sessions.detailTitle",
      parentLabelKey: "admin.nav.sessions",
      parentHref: `/${tenant}/admin/sessions`,
    },
  ];

  const detailMatch = detailMatchers.find((matcher) => matcher.match.test(path));
  if (detailMatch) {
    return {
      title: t(detailMatch.titleKey),
      breadcrumbs: [
        { label: t(detailMatch.parentLabelKey), href: detailMatch.parentHref },
        { label: t(detailMatch.titleKey) },
      ],
    };
  }

  const matchedItem = items.find((item) => isNavItemActive(item, path));
  if (matchedItem) {
    return { title: t(matchedItem.titleKey), breadcrumbs: [] };
  }

  return { title: t("admin.title"), breadcrumbs: [] };
}

function NavIcon({ iconKey }: { iconKey: string }) {
  const icon = useMemo(() => {
    switch (iconKey) {
      case "students":
      case "parents":
      case "staff":
      case "dashboard":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M4.5 19.2c1.8-3 5-4.8 7.5-4.8s5.7 1.8 7.5 4.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        );
      case "centers":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M12 3.5c-3 0-5.5 2.4-5.5 5.4 0 4.2 5.5 10.1 5.5 10.1s5.5-5.9 5.5-10.1c0-3-2.5-5.4-5.5-5.4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        );
      case "groups":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <rect x="4" y="4" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="13" y="4" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="4" y="13" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="13" y="13" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        );
      case "programs":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M5 7.5 12 4l7 3.5-7 3.5-7-3.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M5 12.5l7 3.5 7-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M5 16.5l7 3.5 7-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "subjects":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M5 5.5h11.5a3.5 3.5 0 0 1 3.5 3.5v9.5H8.5A3.5 3.5 0 0 0 5 22V5.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M5 18.5h12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        );
      case "levels":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M6 6h12M6 12h9M6 18h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        );
      case "sessions":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 9h16" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        );
      case "requests":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M6 4h12v16l-3-2-3 2-3-2-3 2V4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        );
      case "audit":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M12 4 5.5 6.5v5.7c0 4 3 6.8 6.5 7.8 3.5-1 6.5-3.8 6.5-7.8V6.5L12 4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        );
      case "help":
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M9.7 9.2a2.4 2.4 0 0 1 4.6.8c0 1.6-2 1.9-2 3.1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="12" cy="17" r="1" fill="currentColor" />
          </svg>
        );
      case "reports":
      default:
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              d="M5 18V6M12 18V10M19 18V4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        );
    }
  }, [iconKey]);

  return <div className={NAV_ICON_STYLES}>{icon}</div>;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`nav-skeleton-${index}`}
          className="h-8 w-full animate-pulse rounded bg-slate-100"
        />
      ))}
    </div>
  );
}

function SidebarNavItems({
  tenant,
  path,
  collapsed,
  openGroups,
  onToggleGroup,
  onNavigate,
  groups,
  topItems,
}: {
  tenant: string;
  path: string;
  collapsed: boolean;
  openGroups: string[];
  onToggleGroup: (groupId: string) => void;
  onNavigate?: () => void;
  groups: AdminNavGroup[];
  topItems: AdminNavItem[];
}) {
  const t = useTranslations();
  const router = useRouter();

  const renderItem = (item: AdminNavItem) => {
    const href = `/${tenant}${item.href}`;
    const isActive = isNavItemActive(item, path);
    const label = t(item.labelKey);
    return (
      <Link
        key={item.id}
        href={href}
        title={collapsed ? label : undefined}
        aria-current={isActive ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        onClick={onNavigate}
        data-testid={`nav-link-${item.id}`}
        className={`relative ${NAV_ITEM_BASE} ${
          isActive ? `${NAV_ITEM_ACTIVE} ${NAV_ITEM_ACTIVE_BAR}` : ""
        } ${collapsed ? "justify-center px-2" : ""}`}
      >
        <NavIcon iconKey={item.iconKey} />
        {collapsed ? <span className="sr-only">{label}</span> : label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="admin-sidebar-nav">
      {topItems.length ? (
        <div className="flex flex-col gap-1" data-testid="admin-nav-top-items">
          {topItems.map(renderItem)}
        </div>
      ) : null}

      {groups.map((group) => {
        const isOpen = openGroups.includes(group.id);
        const label = t(group.labelKey);
        return (
          <div key={group.id} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onToggleGroup(group.id);
                if (group.href) {
                  router.push(`/${tenant}${group.href}`);
                  onNavigate?.();
                }
              }}
              className={`flex w-full items-center justify-between gap-2 ${
                collapsed ? "px-2" : "px-3"
              }`}
              title={collapsed ? label : undefined}
              data-testid={`admin-nav-group-${group.id}`}
              aria-expanded={isOpen}
              aria-label={
                isOpen
                  ? t("admin.shell.group.collapse", { groupName: label })
                  : t("admin.shell.group.expand", { groupName: label })
              }
            >
              {collapsed ? (
                <>
                  <span className="sr-only">{label}</span>
                  <span
                    className="h-px flex-1 rounded bg-slate-200"
                    title={label}
                  />
                </>
              ) : (
                <span className={NAV_GROUP_LABEL}>{label}</span>
              )}
              <svg
                viewBox="0 0 20 20"
                className={`h-4 w-4 text-slate-500 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              >
                <path
                  d="M5 7.5 10 12.5 15 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen ? (
              <div
                className="flex flex-col gap-1"
                data-testid={`admin-nav-group-${group.id}-items`}
              >
                {group.items.map(renderItem)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminShell({
  tenant,
  userRole,
  userId,
  children,
}: AdminShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const normalizedPath = useMemo(
    () => getNormalizedAdminPath(pathname, tenant),
    [pathname, tenant],
  );

  const topItems = useMemo(
    () => filterItemsByRole(userRole, ADMIN_NAV_TOP_ITEMS),
    [userRole],
  );
  const groups = useMemo(
    () => filterGroupsByRole(userRole, ADMIN_NAV_GROUPS),
    [userRole],
  );
  const groupIds = useMemo(() => getAdminNavGroupIds(groups), [groups]);
  const allItems = useMemo(
    () => [...topItems, ...groups.flatMap((group) => group.items)],
    [groups, topItems],
  );

  const { collapsed, openGroups, toggleCollapsed, toggleGroup, ensureGroupOpen } =
    useAdminNavState(tenant, userId, groupIds);

  const activeGroupId = useMemo(() => {
    for (const group of groups) {
      if (group.items.some((item) => isNavItemActive(item, normalizedPath))) {
        return group.id;
      }
    }
    return null;
  }, [groups, normalizedPath]);

  useEffect(() => {
    ensureGroupOpen(activeGroupId);
  }, [activeGroupId, ensureGroupOpen]);

  const { title, breadcrumbs } = useMemo(
    () => resolvePageMeta(normalizedPath, tenant, t, allItems),
    [allItems, normalizedPath, t, tenant],
  );

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const handleMenuToggle = useCallback(() => {
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (isDesktop) {
      toggleCollapsed();
      return;
    }
    setIsMobileOpen(true);
  }, [toggleCollapsed]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    focusable[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    drawer.addEventListener("keydown", handleKeyDown);
    return () => drawer.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMobileOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside
          // Keep sidebar pinned during main-content scroll; the sidebar has its own internal scroll container.
          className={`hidden sticky top-0 h-screen shrink-0 flex-col border-r border-slate-200 bg-white md:flex ${
            collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
          }`}
          aria-label={t("admin.shell.nav.title")}
          data-testid="admin-sidebar"
        >
          <div
            className="flex-1 overflow-y-auto px-3 py-4"
            data-testid="admin-sidebar-scroll"
          >
            {userRole ? (
              <SidebarNavItems
                tenant={tenant}
                path={normalizedPath}
                collapsed={collapsed}
                openGroups={openGroups}
                onToggleGroup={toggleGroup}
                groups={groups}
                topItems={topItems}
              />
            ) : (
              <SidebarSkeleton />
            )}
          </div>
          <div className="border-t border-slate-200 px-3 py-3">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex h-10 w-full items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label={
                collapsed
                  ? t("admin.shell.sidebar.toggleExpand")
                  : t("admin.shell.sidebar.toggleCollapse")
              }
              data-testid="admin-sidebar-toggle"
            >
              {collapsed ? (
                <>
                  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M7 4.5 13 10 7 15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="sr-only">
                    {t("admin.shell.sidebar.toggleExpand")}
                  </span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                    <path
                      d="M13 4.5 7 10l6 5.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="ml-2">
                    {t("admin.shell.sidebar.toggleCollapse")}
                  </span>
                </>
              )}
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header
            className={`sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 ${TOPBAR_HEIGHT}`}
            data-testid="admin-topbar"
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                onClick={handleMenuToggle}
                aria-label={t("admin.shell.topbar.menu.open")}
                data-testid="admin-topbar-menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-900">
                  {title}
                </span>
                {breadcrumbs.length ? (
                  <nav
                    className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
                    aria-label={t("admin.shell.breadcrumbs.label")}
                  >
                    {breadcrumbs.map((crumb, index) => {
                      const isLast = index === breadcrumbs.length - 1;
                      return (
                        <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                          {crumb.href && !isLast ? (
                            <Link
                              href={crumb.href}
                              className="hover:text-slate-700"
                            >
                              {crumb.label}
                            </Link>
                          ) : (
                            <span className="text-slate-600">{crumb.label}</span>
                          )}
                          {!isLast ? <span>/</span> : null}
                        </span>
                      );
                    })}
                  </nav>
                ) : null}
              </div>
            </div>
            <div />
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>

      {isMobileOpen ? (
        <div
          className="fixed inset-0 z-50 flex bg-slate-900/30 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("admin.shell.nav.title")}
          onClick={() => setIsMobileOpen(false)}
          data-testid="admin-mobile-drawer-overlay"
        >
          <div
            ref={drawerRef}
            className="h-full w-[85%] max-w-[320px] bg-white px-4 py-4"
            onClick={(event) => event.stopPropagation()}
            data-testid="admin-mobile-drawer"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                {t("admin.shell.nav.title")}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                onClick={() => setIsMobileOpen(false)}
                aria-label={t("admin.shell.topbar.menu.close")}
                data-testid="admin-mobile-drawer-close"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {userRole ? (
              <SidebarNavItems
                tenant={tenant}
                path={normalizedPath}
                collapsed={false}
                openGroups={openGroups}
                onToggleGroup={toggleGroup}
                onNavigate={() => setIsMobileOpen(false)}
                groups={groups}
                topItems={topItems}
              />
            ) : (
              <SidebarSkeleton />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
