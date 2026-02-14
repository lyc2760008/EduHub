"use client";

// Portal top navigation keeps parent routes discoverable without exposing admin links.
import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useUnreadNotificationsCount } from "@/components/notifications/useUnreadNotificationsCount";
import PortalIdentityMenu from "@/components/parent/portal/PortalIdentityMenu";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";

type PortalTopNavProps = {
  tenantSlug: string;
  tenantLabel?: string;
  showNav?: boolean;
  headerActions?: ReactNode;
};

type NavKey =
  | "dashboard"
  | "students"
  | "sessions"
  | "homework"
  | "announcements"
  | "notifications"
  | "requests";

type NavItem = {
  key: NavKey;
  labelKey: string;
  href: string;
};

function resolveActiveKey(pathname: string | null): NavKey {
  if (!pathname) return "dashboard";
  if (pathname.includes("/portal/students")) return "students";
  if (pathname.includes("/portal/sessions")) return "sessions";
  if (pathname.includes("/portal/homework")) return "homework";
  if (pathname.includes("/portal/announcements")) return "announcements";
  if (pathname.includes("/portal/notifications")) return "notifications";
  if (pathname.includes("/portal/requests")) return "requests";
  return "dashboard";
}

function formatBadgeCount(count: number, capLabel: string) {
  return count > 99 ? capLabel : String(count);
}

export default function PortalTopNav({
  tenantSlug,
  tenantLabel,
  showNav = true,
  headerActions,
}: PortalTopNavProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { data: portalMe } = usePortalMe();
  const { unreadCount } = useUnreadNotificationsCount(tenantSlug);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const basePath = tenantSlug ? `/${tenantSlug}/portal` : "/portal";
  const activeKey = resolveActiveKey(pathname);
  const tenantDisplay =
    portalMe?.tenant?.displayName?.trim() ||
    portalMe?.tenant?.slug?.trim() ||
    tenantLabel ||
    tenantSlug;

  const navItems: NavItem[] = [
    { key: "dashboard", labelKey: "portal.nav.dashboard", href: basePath },
    {
      key: "students",
      labelKey: "portal.nav.students",
      href: `${basePath}/students`,
    },
    {
      key: "sessions",
      labelKey: "portal.nav.sessions",
      href: `${basePath}/sessions`,
    },
    {
      key: "homework",
      labelKey: "parentHomework.nav",
      href: `${basePath}/homework`,
    },
    {
      key: "announcements",
      labelKey: "portalAnnouncements.nav",
      href: `${basePath}/announcements`,
    },
    {
      key: "notifications",
      labelKey: "portal.nav.notifications",
      href: `${basePath}/notifications`,
    },
    // Requests is a read-only portal view for absence request tracking.
    {
      key: "requests",
      labelKey: "portal.nav.requests",
      href: `${basePath}/requests`,
    },
  ];

  // Locale toggle updates the locale cookie and refreshes server-rendered strings.
  function handleLanguageToggle() {
    const currentLocale = document.documentElement.lang || "en";
    const nextLocale = currentLocale === "zh-CN" ? "en" : "zh-CN";
    document.cookie = `locale=${nextLocale}; path=/; max-age=31536000`;
    router.refresh();
  }

  async function handleSignOut() {
    // Parent sign-out should return the user to the parent login route.
    const callbackUrl = tenantSlug
      ? `/${tenantSlug}/parent/login`
      : "/parent/login";
    await signOut({ callbackUrl });
  }

  function closeMenu() {
    setIsMenuOpen(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-3 px-5 py-4 md:px-8">
      <div className="flex w-full items-center justify-between gap-3">
        {showNav ? (
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text)] transition hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] md:hidden"
            aria-expanded={isMenuOpen}
            aria-controls="portal-mobile-menu"
            data-testid="parent-nav-toggle"
          >
            <span className="sr-only">{t("portal.common.open")}</span>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              role="img"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}

        {showNav ? (
          <div className="hidden flex-wrap items-center gap-4 md:flex" data-testid="parent-nav">
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              {navItems.map((item) => {
                const isActive = activeKey === item.key;
                const baseClassName =
                  "relative flex h-11 items-center rounded-xl px-3 transition focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";
                const toneClassName = isActive
                  ? "bg-[var(--surface-2)] text-[var(--text)] font-semibold"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";
                const indicatorClassName = isActive
                  ? "after:absolute after:bottom-1 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:bg-[var(--primary)]"
                  : "";
                const className = `${baseClassName} ${toneClassName} ${indicatorClassName}`;

                if (item.key === "notifications") {
                  return (
                    <Link
                      key={item.key}
                      className={className}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="relative inline-flex items-center gap-2">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          role="img"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 4a4 4 0 0 0-4 4v2.7c0 .8-.3 1.6-.8 2.2L6 14.5h12l-1.2-1.6c-.5-.6-.8-1.4-.8-2.2V8a4 4 0 0 0-4-4Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10.2 17.5a2 2 0 0 0 3.6 0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>{t(item.labelKey)}</span>
                        {unreadCount > 0 ? (
                          <span
                            className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-semibold text-[var(--primary-foreground)]"
                            aria-label={t("notifications.badge.aria", {
                              count: unreadCount,
                            })}
                          >
                            {formatBadgeCount(unreadCount, t("notifications.badge.cap"))}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.key}
                    className={className}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : (
          // Hide the nav for parent auth screens while keeping header spacing stable.
          <div aria-hidden="true" className="hidden h-11 md:block" />
        )}

        {showNav ? (
          <div className="flex min-w-0 flex-1 justify-center md:hidden">
            {tenantDisplay ? (
              <span className="max-w-[180px] truncate text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {tenantDisplay}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLanguageToggle}
            className="flex h-11 items-center rounded-xl px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            data-testid="parent-language-toggle"
          >
            {t("portal.nav.language")}
          </button>
          {showNav ? (
            <>
              <PortalIdentityMenu
                variant="compact"
                className="md:hidden"
                tenantLabel={tenantLabel}
              />
              <PortalIdentityMenu
                variant="full"
                className="hidden md:block"
                tenantLabel={tenantLabel}
              />
            </>
          ) : null}
          {/* Header actions remain optional so portal pages can add secondary controls. */}
          {headerActions ? (
            <div className="flex items-center gap-2">{headerActions}</div>
          ) : null}
        </div>
      </div>

      {showNav && isMenuOpen ? (
        // Mobile menu keeps portal navigation and account links accessible on small screens.
        <div className="fixed inset-0 z-50" data-testid="portal-mobile-menu">
          <button
            type="button"
            onClick={closeMenu}
            className="absolute inset-0 bg-black/40"
            aria-label={t("portal.common.cancel")}
          />
          <div
            id="portal-mobile-menu"
            className="relative h-full w-full max-w-xs rounded-tr-2xl bg-[var(--background)] p-5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {tenantDisplay}
              </span>
              <button
                type="button"
                onClick={closeMenu}
                className="text-sm font-semibold text-[var(--muted)]"
              >
                {t("portal.common.cancel")}
              </button>
            </div>

            <nav className="mt-4 grid gap-2">
              {navItems.map((item) => {
                const isActive = activeKey === item.key;
                const isNotifications = item.key === "notifications";
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={closeMenu}
                    className={`flex h-11 items-center rounded-xl px-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-[var(--surface-2)] text-[var(--text)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    }`}
                    >
                    <span className="inline-flex items-center gap-2">
                      <span>{t(item.labelKey)}</span>
                      {isNotifications && unreadCount > 0 ? (
                        <span
                          className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-semibold text-[var(--primary-foreground)]"
                          aria-label={t("notifications.badge.aria", {
                            count: unreadCount,
                          })}
                        >
                          {formatBadgeCount(unreadCount, t("notifications.badge.cap"))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <div className="grid gap-2">
                <Link
                  href={`${basePath}/account`}
                  onClick={closeMenu}
                  className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  {t("portal.header.menu.account")}
                </Link>
                <Link
                  href={`${basePath}/help`}
                  onClick={closeMenu}
                  className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  {t("portal.header.menu.help")}
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    closeMenu();
                    await handleSignOut();
                  }}
                  className="flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  {t("portal.header.menu.logout")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
