"use client";

// Parent dashboard page pulls read-only data from portal APIs for summary cards.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import SectionHeader from "@/components/parent/SectionHeader";
import PortalEmptyState from "@/components/parent/portal/PortalEmptyState";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import PortalTimeHint from "@/components/parent/portal/PortalTimeHint";
import PortalWelcomeCard from "@/components/parent/portal/PortalWelcomeCard";
import StudentCard from "@/components/parent/portal/StudentCard";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  formatPortalDateTime,
  formatPortalDateTimeRange,
  getSessionTypeLabelKey,
} from "@/lib/portal/format";

const SUMMARY_RANGE_DAYS = 30;
const UPCOMING_RANGE_DAYS = 7;

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
  level: { id: string; name: string } | null;
  isActive: boolean;
};

type PortalStudentsResponse = {
  items: PortalStudent[];
  total: number;
};

type PortalSession = {
  id: string;
  studentId: string;
  startAt: string;
  endAt?: string | null;
  timezone?: string | null;
  sessionType: string;
  groupName?: string | null;
};

type PortalSessionsResponse = {
  items: PortalSession[];
};

type PortalAttendanceResponse = {
  countsByStatus: Record<string, number>;
};

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function getRangeFromToday(days: number) {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + days);
  return { from, to };
}

function getRangeLastDays(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from, to };
}

export default function PortalDashboardPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ tenant?: string }>();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";

  // Portal identity data is shared from the layout-level /me fetch.
  const { data: portalMe, isLoading: isMeLoading, error: meError, reload: reloadMe } =
    usePortalMe();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [students, setStudents] = useState<PortalStudent[]>([]);
  const [nextSession, setNextSession] = useState<PortalSession | null>(null);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [isDismissingWelcome, setIsDismissingWelcome] = useState(false);
  const [welcomeError, setWelcomeError] = useState(false);

  const studentNameById = useMemo(() => {
    return new Map(
      students.map((student) => [student.id, `${student.firstName} ${student.lastName}`]),
    );
  }, [students]);

  const loadDashboard = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setHasError(false);

    const studentParams = new URLSearchParams({ take: "100", skip: "0" });
    const upcomingRange = getRangeFromToday(UPCOMING_RANGE_DAYS);
    const upcomingParams = new URLSearchParams({
      from: upcomingRange.from.toISOString(),
      to: upcomingRange.to.toISOString(),
      take: "1",
      skip: "0",
    });
    const summaryRange = getRangeLastDays(SUMMARY_RANGE_DAYS);
    const attendanceParams = new URLSearchParams({
      from: summaryRange.from.toISOString(),
      to: summaryRange.to.toISOString(),
      take: "1",
      skip: "0",
    });

    const [studentsResult, sessionsResult, attendanceResult] = await Promise.all([
      fetchJson<PortalStudentsResponse>(
        buildPortalApiUrl(tenant, "/students", studentParams),
      ),
      fetchJson<PortalSessionsResponse>(
        buildPortalApiUrl(tenant, "/sessions", upcomingParams),
      ),
      fetchJson<PortalAttendanceResponse>(
        buildPortalApiUrl(tenant, "/attendance", attendanceParams),
      ),
    ]);

    if (!studentsResult.ok || !sessionsResult.ok || !attendanceResult.ok) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setStudents(studentsResult.data.items);
    setNextSession(sessionsResult.data.items[0] ?? null);
    setAttendanceCounts(attendanceResult.data.countsByStatus ?? {});
    setIsLoading(false);
  }, [tenant]);

  useEffect(() => {
    // Defer load to avoid setting state during render on first mount.
    const handle = setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadDashboard]);

  const linkedStudentCount = students.length;
  const linkedActiveStudentCount =
    students.filter((student) => student.isActive).length ?? 0;
  const hasStudents = linkedStudentCount > 0;
  const timeZone = portalMe?.tenant?.timeZone ?? undefined;
  // Favor session timezones when available to align with admin display.
  const nextSessionTimeZone = nextSession?.timezone ?? timeZone;
  const isPageLoading = isLoading || isMeLoading;
  // Keep /me errors from blocking the dashboard so welcome UI can degrade gracefully.
  const hasPageError = hasError;

  const welcomeAlreadyDismissed = Boolean(portalMe?.parent?.hasSeenWelcome);
  const shouldShowWelcome = !welcomeAlreadyDismissed && !welcomeDismissed;

  const handleDismissWelcome = useCallback(async () => {
    if (!tenant) return;
    setIsDismissingWelcome(true);
    setWelcomeError(false);

    const result = await fetchJson<{ hasSeenWelcome: boolean }>(
      buildPortalApiUrl(tenant, "/onboarding/dismiss"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (!result.ok) {
      setWelcomeError(true);
      setIsDismissingWelcome(false);
      return;
    }

    setWelcomeDismissed(true);
    setIsDismissingWelcome(false);
  }, [tenant]);

  const attendanceSummary = [
    { status: "PRESENT", key: "portal.attendance.status.present" },
    { status: "ABSENT", key: "portal.attendance.status.absent" },
    { status: "LATE", key: "portal.attendance.status.late" },
    { status: "EXCUSED", key: "portal.attendance.status.excused" },
  ];

  if (isPageLoading) {
    return (
      <div className="space-y-6" data-testid="portal-dashboard-loading">
        <PortalSkeletonBlock className="h-28" />
        <PortalSkeletonBlock className="h-8 w-40" />
        <PortalSkeletonBlock className="h-4 w-60" />
        <div className="grid gap-4 md:grid-cols-3">
          <PortalSkeletonBlock className="h-28" />
          <PortalSkeletonBlock className="h-28" />
          <PortalSkeletonBlock className="h-28" />
        </div>
        <div className="space-y-3">
          <PortalSkeletonBlock className="h-6 w-40" />
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <PortalSkeletonBlock key={index} className="h-20" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (hasPageError) {
    return (
      <div className="space-y-6" data-testid="portal-dashboard-error">
        <PageHeader titleKey="portal.dashboard.title" />
        {/* Time hint remains visible even when the dashboard fails to load. */}
        <PortalTimeHint timeZones={[nextSession?.timezone]} />
        <Card>
          <div className="space-y-3 text-center">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("portal.error.generic.title")}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {t("portal.error.generic.body")}
            </p>
            <button
              type="button"
              onClick={() => {
                void loadDashboard();
                reloadMe();
              }}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
            >
              {t("portal.common.tryAgain")}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!hasStudents) {
    return (
      <div className="space-y-6" data-testid="portal-dashboard-empty">
        <PageHeader titleKey="portal.dashboard.title" />
        {/* Time hint remains visible even when there are no linked students yet. */}
        <PortalTimeHint timeZones={[nextSession?.timezone]} />
        <PortalEmptyState
          variant="noStudents"
          hintKey="portal.empty.noStudents.hint"
          actionLabelKey="portal.empty.noStudents.cta"
          actionHref={tenant ? `/${tenant}/portal/students` : "/portal/students"}
        />
      </div>
    );
  }

  const greetingName = portalMe?.parent.displayName?.trim();
  const nextSessionTypeKey = nextSession
    ? getSessionTypeLabelKey(nextSession.sessionType)
    : null;
  const nextSessionTitle =
    nextSession?.groupName?.trim() ||
    (nextSessionTypeKey ? t(nextSessionTypeKey) : t("generic.dash"));
  const nextSessionStudentName = nextSession
    ? studentNameById.get(nextSession.studentId)
    : null;

  return (
    <div className="space-y-8" data-testid="portal-dashboard-page">
      {shouldShowWelcome ? (
        // Welcome card is non-blocking and dismissible on first login only.
        <PortalWelcomeCard
          students={students}
          tenantSlug={tenant}
          isDismissing={isDismissingWelcome}
          hasError={welcomeError || Boolean(meError)}
          onDismiss={() => void handleDismissWelcome()}
        />
      ) : null}
      <div className="space-y-2">
        <PageHeader titleKey="portal.dashboard.title" />
        {/* Time hint reinforces the timezone rule across dashboard summaries. */}
        <PortalTimeHint timeZones={[nextSession?.timezone]} />
        <p className="text-sm text-[var(--muted)]">
          {greetingName
            ? t("portal.dashboard.greetingWithName", { name: greetingName })
            : t("portal.dashboard.greeting")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div data-testid="portal-dashboard-card-students">
          <Card>
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">
              {t("portal.dashboard.cards.students.title")}
            </p>
            <p className="text-2xl font-semibold text-[var(--text)]">
              {linkedActiveStudentCount}
            </p>
            <Link
              href={tenant ? `/${tenant}/portal/students` : "/portal/students"}
              className="text-sm font-medium text-[var(--primary)]"
            >
              {t("portal.common.viewAll")}
            </Link>
          </div>
          </Card>
        </div>
        <div data-testid="portal-dashboard-card-next-session">
          <Card>
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted)]">
              {t("portal.dashboard.cards.nextSession.title")}
            </p>
            {nextSession ? (
              <Link
                href={
                  tenant
                    ? `/${tenant}/portal/sessions/${nextSession.id}`
                    : `/portal/sessions/${nextSession.id}`
                }
                // Next-session preview links to the session detail view.
                className="block rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {formatPortalDateTimeRange(
                      nextSession.startAt,
                      nextSession.endAt ?? null,
                      locale,
                      nextSessionTimeZone,
                    ) ||
                      formatPortalDateTime(
                        nextSession.startAt,
                        locale,
                        nextSessionTimeZone,
                      )}
                  </p>
                  <p className="text-sm text-[var(--muted)]">{nextSessionTitle}</p>
                  {nextSessionStudentName ? (
                    <p className="text-xs text-[var(--muted-2)]">
                      {nextSessionStudentName}
                    </p>
                  ) : null}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {t("portal.empty.noUpcomingSessions.short")}
              </p>
            )}
            <Link
              href={tenant ? `/${tenant}/portal/sessions` : "/portal/sessions"}
              className="text-sm font-medium text-[var(--primary)]"
            >
              {t("portal.common.viewAll")}
            </Link>
          </div>
          </Card>
        </div>
        <div data-testid="portal-dashboard-card-attendance">
          <Card>
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]">
              {t("portal.dashboard.cards.attendance.title")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {attendanceSummary.map((entry) => (
                <div
                  key={entry.status}
                  className="rounded-xl bg-[var(--surface-2)] p-3 text-sm"
                >
                  <p className="text-xs text-[var(--muted)]">
                    {t(entry.key)}
                  </p>
                  <p className="text-lg font-semibold text-[var(--text)]">
                    {attendanceCounts[entry.status] ?? 0}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href={tenant ? `/${tenant}/portal/students` : "/portal/students"}
              className="text-sm font-medium text-[var(--primary)]"
            >
              {t("portal.dashboard.cards.attendance.cta")}
            </Link>
          </div>
          </Card>
        </div>
      </div>

      <section className="space-y-3" data-testid="portal-dashboard-student-preview">
        <SectionHeader titleKey="portal.dashboard.section.myStudents" />
        <div className="grid gap-3">
          {students.slice(0, 3).map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              href={tenant ? `/${tenant}/portal/students/${student.id}` : `/portal/students/${student.id}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

