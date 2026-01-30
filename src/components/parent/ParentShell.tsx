"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import styles from "./parentTokens.module.css";

type ParentShellProps = {
  children: ReactNode;
  activeNavKey?: "dashboard" | "children" | "logout";
  showBack?: boolean;
  headerActions?: ReactNode;
};

type NavItem = {
  key: "dashboard" | "children" | "logout";
  labelKey: string;
  href?: string;
};

export default function ParentShell({
  children,
  activeNavKey,
  showBack,
  headerActions,
}: ParentShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ tenant?: string }>();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  const dashboardHref = tenant ? `/${tenant}/parent` : "/parent";

  // Resolve the active nav state from the route when not explicitly set.
  const resolvedActiveKey =
    activeNavKey ??
    (pathname && pathname.startsWith(dashboardHref) ? "dashboard" : undefined);

  // showBack is reserved for future parent flows once the i18n copy is defined.
  void showBack;

  const navItems: NavItem[] = [
    { key: "dashboard", labelKey: "parent.nav.dashboard", href: dashboardHref },
    { key: "children", labelKey: "parent.nav.children" },
    { key: "logout", labelKey: "parent.nav.logout" },
  ];

  // Locale toggle updates the locale cookie and refreshes server-rendered strings.
  function handleLanguageToggle() {
    const currentLocale = document.documentElement.lang || "en";
    const nextLocale = currentLocale === "zh-CN" ? "en" : "zh-CN";
    document.cookie = `locale=${nextLocale}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <div
      className={`${styles.parentPortal} min-h-screen bg-[var(--background)] text-[var(--text)]`}
      data-testid="parent-shell"
    >
      {/* Parent header is scoped so admin styles remain untouched. */}
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-8">
          <nav
            className="flex flex-wrap items-center gap-2 text-sm"
            data-testid="parent-nav"
          >
            {navItems.map((item) => {
              const isActive = resolvedActiveKey === item.key;
              const baseClassName =
                "flex h-11 items-center rounded-xl px-3 transition focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";
              const toneClassName = isActive
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";
              const className = `${baseClassName} ${toneClassName}`;

              if (item.href) {
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
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  className={className}
                  aria-disabled="true"
                  onClick={(event) => event.preventDefault()}
                >
                  {t(item.labelKey)}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLanguageToggle}
              className="flex h-11 items-center rounded-xl px-3 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              data-testid="parent-language-toggle"
            >
              {t("parent.actions.language")}
            </button>
            {/* Header actions remain optional so parent pages can inject secondary controls. */}
            {headerActions ? (
              <div className="flex items-center gap-2">{headerActions}</div>
            ) : null}
          </div>
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-5xl p-5 md:p-8"
        data-testid="parent-content"
      >
        {children}
      </main>
    </div>
  );
}
