"use client";

// Welcome card shown on first login to orient parents without blocking the dashboard.
import Link from "next/link";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";

type PortalWelcomeStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type PortalWelcomeCardProps = {
  students: PortalWelcomeStudent[];
  tenantSlug: string;
  isDismissing: boolean;
  hasError: boolean;
  onDismiss: () => void;
};

function formatStudentName(student: PortalWelcomeStudent) {
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim();
}

export default function PortalWelcomeCard({
  students,
  tenantSlug,
  isDismissing,
  hasError,
  onDismiss,
}: PortalWelcomeCardProps) {
  const t = useTranslations();
  const count = students.length;
  const chipStudents = students.slice(0, 2);
  const overflowCount = Math.max(0, count - chipStudents.length);

  const studentsHref = tenantSlug
    ? `/${tenantSlug}/portal/students`
    : "/portal/students";
  const sessionsHref = tenantSlug
    ? `/${tenantSlug}/portal/sessions`
    : "/portal/sessions";
  // Attendance uses the student detail tab; link to the students list for selection.
  const attendanceHref = studentsHref;
  const helpHref = tenantSlug ? `/${tenantSlug}/portal/help` : "/portal/help";

  return (
    <div
      // data-testid supports stable E2E selection of the welcome onboarding surface.
      data-testid="portal-welcome-card"
    >
      <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("portal.welcome.title")}
            </h2>
            {hasError ? (
              <p className="text-sm text-[var(--muted)]">
                {t("portal.welcome.error.body")}
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {t("portal.welcome.body", { count })}
              </p>
            )}
          </div>

          {!hasError && count > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {chipStudents.map((student) => (
                <span
                  key={student.id}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs text-[var(--text)]"
                >
                  {formatStudentName(student)}
                </span>
              ))}
              {overflowCount > 0 ? (
                <span className="text-xs text-[var(--muted)]">
                  {t("portal.welcome.more", { count: overflowCount })}
                </span>
              ) : null}
            </div>
          ) : null}

          {!hasError && count === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              {t("portal.welcome.noStudents")}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          disabled={isDismissing}
          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:opacity-60"
          data-testid="portal-welcome-dismiss"
        >
          {t("portal.welcome.action.dismiss")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={studentsHref}
          className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-[var(--primary-foreground)]"
          data-testid="portal-welcome-link-students"
        >
          {t("portal.welcome.cta.students")}
        </Link>
        <Link
          href={sessionsHref}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)]"
          data-testid="portal-welcome-link-sessions"
        >
          {t("portal.welcome.cta.sessions")}
        </Link>
        <Link
          href={attendanceHref}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)]"
          data-testid="portal-welcome-link-attendance"
        >
          {t("portal.welcome.cta.attendance")}
        </Link>
        <Link
          href={helpHref}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text)]"
          data-testid="portal-welcome-link-help"
        >
          {t("portal.welcome.cta.help")}
        </Link>
      </div>
    </Card>
    </div>
  );
}
