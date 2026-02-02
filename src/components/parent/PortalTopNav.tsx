"use client";

// Portal top navigation keeps parent routes discoverable without exposing admin links.
import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type PortalTopNavProps = {
  tenantSlug: string;
  tenantLabel?: string;
  showNav?: boolean;
  headerActions?: ReactNode;
};

type NavKey = "dashboard" | "students" | "sessions" | "requests";

type NavItem = {
  key: NavKey;
  labelKey: string;
  href: string;
};

function resolveActiveKey(pathname: string | null): NavKey {
  if (!pathname) return "dashboard";
  if (pathname.includes("/portal/students")) return "students";
  if (pathname.includes("/portal/sessions")) return "sessions";
  if (pathname.includes("/portal/requests")) return "requests";
  return "dashboard";
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
  const basePath = tenantSlug ? `/${tenantSlug}/portal` : "/portal";
  const activeKey = resolveActiveKey(pathname);

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

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-8">
      {showNav ? (
        <div className="flex flex-wrap items-center gap-4" data-testid="parent-nav">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {tenantLabel ?? tenantSlug}
          </span>
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
        <div aria-hidden="true" className="h-11" />
      )}
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
          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-11 items-center rounded-xl px-3 text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            data-testid="parent-signout"
          >
            {t("portal.nav.signOut")}
          </button>
        ) : null}
        {/* Header actions remain optional so portal pages can add secondary controls. */}
        {headerActions ? (
          <div className="flex items-center gap-2">{headerActions}</div>
        ) : null}
      </div>
    </div>
  );
}

