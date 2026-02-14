"use client";

// Tutor shell provides a focused navigation frame for tutor-only workflows.
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useUnreadNotificationsCount } from "@/components/notifications/useUnreadNotificationsCount";

type TutorShellProps = {
  tenant: string;
  tenantLabel?: string;
  children: ReactNode;
};

function formatBadgeCount(count: number, capLabel: string) {
  return count > 99 ? capLabel : String(count);
}

export default function TutorShell({
  tenant,
  tenantLabel,
  children,
}: TutorShellProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const sessionsHref = `/${tenant}/tutor/sessions`;
  const homeworkHref = `/${tenant}/tutor/homework`;
  const announcementsHref = `/${tenant}/tutor/announcements`;
  const notificationsHref = `/${tenant}/tutor/notifications`;
  const { unreadCount } = useUnreadNotificationsCount(tenant);
  const isSessionsRoute =
    pathname === sessionsHref || pathname.startsWith(`${sessionsHref}/`);
  const isHomeworkRoute =
    pathname === homeworkHref || pathname.startsWith(`${homeworkHref}/`);
  const isAnnouncementsRoute =
    pathname === announcementsHref || pathname.startsWith(`${announcementsHref}/`);
  const isNotificationsRoute =
    pathname === notificationsHref || pathname.startsWith(`${notificationsHref}/`);
  const title = isAnnouncementsRoute
    ? t("portalAnnouncements.feed.title")
    : isNotificationsRoute
      ? t("notifications.page.title")
    : isHomeworkRoute
      ? t("staffHomework.queue.title")
    : t("tutorSessions.page.title");

  return (
    <div className="min-h-screen bg-slate-50" data-testid="tutor-shell">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wide text-slate-500">
              {tenantLabel ?? tenant}
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {title}
            </p>
          </div>
          {/* Tutor nav includes sessions plus announcements while staying concise on small screens. */}
          <nav className="flex items-center gap-2" aria-label={t("admin.shell.nav.title")}>
            <Link
              href={sessionsHref}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isSessionsRoute
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-current={isSessionsRoute ? "page" : undefined}
              data-testid="tutor-nav-my-sessions"
            >
              {t("tutorSessions.page.title")}
            </Link>
            <Link
              href={announcementsHref}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isAnnouncementsRoute
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-current={isAnnouncementsRoute ? "page" : undefined}
              data-testid="tutor-nav-announcements"
            >
              {t("portalAnnouncements.nav")}
            </Link>
            <Link
              href={homeworkHref}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isHomeworkRoute
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-current={isHomeworkRoute ? "page" : undefined}
              data-testid="tutor-nav-homework"
            >
              {t("homework.common.homework")}
            </Link>
            <Link
              href={notificationsHref}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                isNotificationsRoute
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
              aria-current={isNotificationsRoute ? "page" : undefined}
              data-testid="tutor-nav-notifications"
            >
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
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
                <span>{t("tutor.nav.notifications")}</span>
                {unreadCount > 0 ? (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      isNotificationsRoute
                        ? "bg-white text-slate-900"
                        : "bg-slate-900 text-white"
                    }`}
                    aria-label={t("notifications.badge.aria", {
                      count: unreadCount,
                    })}
                  >
                    {formatBadgeCount(unreadCount, t("notifications.badge.cap"))}
                  </span>
                ) : null}
              </span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
