"use client";

// Tutor shell provides a focused navigation frame for tutor-only workflows.
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

type TutorShellProps = {
  tenant: string;
  tenantLabel?: string;
  children: ReactNode;
};

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
  const isSessionsRoute =
    pathname === sessionsHref || pathname.startsWith(`${sessionsHref}/`);
  const isHomeworkRoute =
    pathname === homeworkHref || pathname.startsWith(`${homeworkHref}/`);
  const isAnnouncementsRoute =
    pathname === announcementsHref || pathname.startsWith(`${announcementsHref}/`);
  const title = isAnnouncementsRoute
    ? t("portalAnnouncements.feed.title")
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
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
