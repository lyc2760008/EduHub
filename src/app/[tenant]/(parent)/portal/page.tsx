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
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import StudentCard from "@/components/parent/portal/StudentCard";
import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTime, getSessionTypeLabelKey } from "@/lib/portal/format";

const SUMMARY_RANGE_DAYS = 30;
const UPCOMING_RANGE_DAYS = 7;

type PortalMeResponse = {
  parent: { id: string; email: string; name: string | null; isActive?: boolean };
  linkedStudentIds: string[];
  linkedStudentCount: number;
  linkedActiveStudentCount?: number;
};

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

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [students, setStudents] = useState<PortalStudent[]>([]);
  const [nextSession, setNextSession] = useState<PortalSession | null>(null);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});

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

    const [meResult, studentsResult, sessionsResult, attendanceResult] =
      await Promise.all([
        fetchJson<PortalMeResponse>(buildPortalApiUrl(tenant, "/me")),
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

    if (!meResult.ok || !studentsResult.ok || !sessionsResult.ok || !attendanceResult.ok) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setMe(meResult.data);
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

  const linkedStudentCount = me?.linkedStudentCount ?? 0;
  const linkedActiveStudentCount =
    me?.linkedActiveStudentCount ?? me?.linkedStudentCount ?? 0;
  const hasStudents = linkedStudentCount > 0;

  const attendanceSummary = [
    { status: "PRESENT", key: "portal.attendance.status.present" },
    { status: "ABSENT", key: "portal.attendance.status.absent" },
    { status: "LATE", key: "portal.attendance.status.late" },
    { status: "EXCUSED", key: "portal.attendance.status.excused" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-dashboard-loading">
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

  if (hasError) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-dashboard-error">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.error.generic.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.error.generic.body")}
          </p>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </Card>
    );
  }

  if (!hasStudents) {
    return (
      <PortalEmptyState
        variant="noStudents"
        hintKey="portal.empty.noStudents.hint"
        actionLabelKey="portal.empty.noStudents.cta"
        actionHref={tenant ? `/${tenant}/portal/students` : "/portal/students"}
      />
    );
  }

  const greetingName = me?.parent.name?.trim();
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
      <div className="space-y-2">
        <PageHeader titleKey="portal.dashboard.title" />
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
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {formatPortalDateTime(nextSession.startAt, locale)}
                </p>
                <p className="text-sm text-[var(--muted)]">{nextSessionTitle}</p>
                {nextSessionStudentName ? (
                  <p className="text-xs text-[var(--muted-2)]">
                    {nextSessionStudentName}
                  </p>
                ) : null}
              </div>
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

