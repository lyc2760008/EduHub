/**
 * @state.route /[tenant]/portal/students/[id]
 * @state.area parent
 * @state.capabilities view:detail
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
"use client";

// Parent portal student detail page with overview + attendance tabs.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalTabs from "@/components/parent/portal/PortalTabs";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import AttendanceRow from "@/components/parent/portal/AttendanceRow";
import SessionRow from "@/components/parent/portal/SessionRow";
import StudentProgressNotesSection from "@/components/parent/portal/StudentProgressNotesSection";
import PortalTimeHint from "@/components/parent/portal/PortalTimeHint";
import { fetchJson } from "@/lib/api/fetchJson";

type PortalStudentDetail = {
  id: string;
  firstName: string;
  lastName: string;
  level: { id: string; name: string } | null;
  isActive: boolean;
};

type PortalStudentResponse = {
  student: PortalStudentDetail;
};

type PortalSession = {
  id: string;
  startAt: string;
  endAt?: string | null;
  timezone?: string | null;
  sessionType: string;
  canceledAt?: string | null;
  cancelReasonCode?: string | null;
  groupName?: string | null;
};

type PortalSessionsResponse = {
  items: PortalSession[];
};

type PortalAttendanceItem = {
  id: string;
  // Session id is used to link attendance rows to the session detail view.
  sessionId: string;
  dateTime: string;
  sessionEndAt?: string | null;
  timezone?: string | null;
  status: string;
  sessionType: string;
  groupName?: string | null;
  // Parent-visible note preview is rendered inline in attendance rows.
  parentVisibleNote?: string | null;
};

type PortalAttendanceResponse = {
  countsByStatus: Record<string, number>;
  items: PortalAttendanceItem[];
};

const UPCOMING_RANGE_DAYS = 14;
const ATTENDANCE_DEFAULT_RANGE = 30;

// Portal API errors expose safe codes for client-side handling.
function resolvePortalErrorCode(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const payload = details as { error?: { code?: unknown } };
  const code = payload.error?.code;
  return typeof code === "string" ? code : undefined;
}

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

export default function PortalStudentDetailPage() {
  const t = useTranslations();
  const params = useParams<{ tenant?: string; id?: string }>();
  const router = useRouter();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  const studentId = typeof params.id === "string" ? params.id : "";

  const [activeTab, setActiveTab] = useState("overview");
  const [attendanceRange, setAttendanceRange] = useState(ATTENDANCE_DEFAULT_RANGE);
  const [student, setStudent] = useState<PortalStudentDetail | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<PortalSession[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({});
  const [attendanceItems, setAttendanceItems] = useState<PortalAttendanceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // Aggregate session timezones so the time hint reflects actual data.
  const sessionTimeZones = useMemo(() => {
    const zones = new Set<string>();
    upcomingSessions
      .map((session) => session.timezone)
      .filter((value): value is string => Boolean(value))
      .forEach((value) => zones.add(value));
    attendanceItems
      .map((item) => item.timezone)
      .filter((value): value is string => Boolean(value))
      .forEach((value) => zones.add(value));
    return Array.from(zones);
  }, [attendanceItems, upcomingSessions]);

  const studentName = student ? `${student.firstName} ${student.lastName}` : "";
  const statusLabelKey = student?.isActive
    ? "portal.student.status.active"
    : "portal.student.status.inactive";
  const statusToneClassName = student?.isActive
    ? "border-[var(--success)] text-[var(--success)]"
    : "border-[var(--border)] text-[var(--muted)]";

  const attendanceSummary = useMemo(
    () => [
      { status: "PRESENT", key: "portal.attendance.status.present" },
      { status: "ABSENT", key: "portal.attendance.status.absent" },
      { status: "LATE", key: "portal.attendance.status.late" },
      { status: "EXCUSED", key: "portal.attendance.status.excused" },
    ],
    [],
  );

  const loadStudentDetail = useCallback(async () => {
    if (!tenant || !studentId) return;
    setIsLoading(true);
    setHasError(false);
    setNotFound(false);

    const studentResult = await fetchJson<PortalStudentResponse>(
      buildPortalApiUrl(tenant, `/students/${studentId}`),
    );

    if (!studentResult.ok) {
      const errorCode = resolvePortalErrorCode(studentResult.details);
      if (studentResult.status === 401 || errorCode === "UNAUTHORIZED") {
        router.replace(tenant ? `/${tenant}/parent/login` : "/parent/login");
        return;
      }
      if (studentResult.status === 404 || errorCode === "NOT_FOUND") {
        setNotFound(true);
      } else {
        setHasError(true);
      }
      setIsLoading(false);
      return;
    }

    const upcomingRange = getRangeFromToday(UPCOMING_RANGE_DAYS);
    const upcomingParams = new URLSearchParams({
      studentId,
      from: upcomingRange.from.toISOString(),
      to: upcomingRange.to.toISOString(),
      take: "3",
      skip: "0",
    });

    const attendanceRange = getRangeLastDays(ATTENDANCE_DEFAULT_RANGE);
    const attendanceParams = new URLSearchParams({
      studentId,
      from: attendanceRange.from.toISOString(),
      to: attendanceRange.to.toISOString(),
      take: "1",
      skip: "0",
    });

    const [sessionsResult, attendanceResult] = await Promise.all([
      fetchJson<PortalSessionsResponse>(
        buildPortalApiUrl(tenant, "/sessions", upcomingParams),
      ),
      fetchJson<PortalAttendanceResponse>(
        buildPortalApiUrl(tenant, "/attendance", attendanceParams),
      ),
    ]);

    if (!sessionsResult.ok || !attendanceResult.ok) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setStudent(studentResult.data.student);
    setUpcomingSessions(sessionsResult.data.items ?? []);
    setAttendanceCounts(attendanceResult.data.countsByStatus ?? {});
    setIsLoading(false);
  }, [router, studentId, tenant]);

  const loadAttendanceHistory = useCallback(async () => {
    if (!tenant || !studentId) return;
    setIsAttendanceLoading(true);
    setAttendanceError(false);

    const range = getRangeLastDays(attendanceRange);
    const params = new URLSearchParams({
      studentId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      take: "100",
      skip: "0",
    });

    const result = await fetchJson<PortalAttendanceResponse>(
      buildPortalApiUrl(tenant, "/attendance", params),
    );

    if (!result.ok) {
      setAttendanceError(true);
      setIsAttendanceLoading(false);
      return;
    }

    setAttendanceItems(result.data.items ?? []);
    setIsAttendanceLoading(false);
  }, [attendanceRange, studentId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadStudentDetail();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadStudentDetail]);

  useEffect(() => {
    if (activeTab !== "attendance") return;
    const handle = setTimeout(() => {
      void loadAttendanceHistory();
    }, 0);
    return () => clearTimeout(handle);
  }, [activeTab, loadAttendanceHistory]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-student-detail-loading">
        <PortalSkeletonBlock className="h-6 w-32" />
        <PortalSkeletonBlock className="h-8 w-52" />
        <PortalSkeletonBlock className="h-12 w-56" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-student-not-found">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.error.notAvailable.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.error.notAvailable.body")}
          </p>
          <Link
            href={tenant ? `/${tenant}/portal` : "/portal"}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.error.notAvailable.cta")}
          </Link>
        </div>
      </Card>
    );
  }

  if (hasError || !student) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-student-detail-error">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.error.studentDetail.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.error.studentDetail.body")}
          </p>
          <button
            type="button"
            onClick={() => void loadStudentDetail()}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="portal-student-detail-page">
      <div className="space-y-3">
        <Link
          href={tenant ? `/${tenant}/portal/students` : "/portal/students"}
          className="text-sm text-[var(--muted)]"
        >
          {t("portal.common.back")}
        </Link>
        <PageHeader titleKey="portal.student.detail.title" />
        {/* Time hint keeps session and attendance timestamps aligned to the portal timezone. */}
        <PortalTimeHint timeZones={sessionTimeZones} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-lg font-semibold text-[var(--text)]">
            {studentName}
          </p>
          {student.level?.name ? (
            <span className="text-xs text-[var(--muted)]">
              {t("portal.student.level.label")}: {student.level.name}
            </span>
          ) : null}
          <span
            className={`rounded-full border px-2 py-1 text-xs font-medium ${statusToneClassName}`}
          >
            {t(statusLabelKey)}
          </span>
        </div>
      </div>

      <PortalTabs
        options={[
          { key: "overview", labelKey: "portal.student.tabs.overview" },
          { key: "attendance", labelKey: "portal.student.tabs.attendance" },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "overview" ? (
        <div className="space-y-6" data-testid="portal-student-overview">
          <section className="space-y-3" data-testid="portal-student-overview-upcoming">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text)]">
                {t("portal.student.overview.upcoming.title")}
              </h2>
              <Link
                href={
                  tenant
                    ? `/${tenant}/portal/sessions?studentId=${student.id}`
                    : `/portal/sessions?studentId=${student.id}`
                }
                className="text-sm text-[var(--primary)]"
              >
                {t("portal.student.overview.upcoming.cta")}
              </Link>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                {t("portal.empty.noUpcomingSessions.short")}
              </p>
            ) : (
              <div className="grid gap-3">
                {upcomingSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    // Wire each row to session detail so "Open" and the full card are clickable.
                    href={
                      tenant
                        ? `/${tenant}/portal/sessions/${session.id}`
                        : `/portal/sessions/${session.id}`
                    }
                    showStudentName={false}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3" data-testid="portal-student-overview-attendance">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text)]">
                {t("portal.student.overview.attendance.title")}
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab("attendance")}
                className="text-sm text-[var(--primary)]"
              >
                {t("portal.student.tabs.attendance")}
              </button>
            </div>
            {Object.keys(attendanceCounts).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                {t("portal.empty.noAttendance.short")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {attendanceSummary.map((entry) => (
                  <div
                    key={entry.status}
                    className="rounded-xl bg-[var(--surface-2)] p-3"
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
            )}
          </section>

          {/* Progress notes remain read-only and scoped to this student (Step 22.3). */}
          <StudentProgressNotesSection tenant={tenant} studentId={student.id} />
        </div>
      ) : (
        <div className="space-y-4" data-testid="portal-student-attendance">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-[var(--muted)]">
              {t("portal.common.range")}
            </label>
            <select
              className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              value={attendanceRange}
              onChange={(event) => setAttendanceRange(Number(event.target.value))}
            >
              <option value={30}>{t("portal.attendance.range.30")}</option>
              <option value={60}>{t("portal.attendance.range.60")}</option>
              <option value={90}>{t("portal.attendance.range.90")}</option>
            </select>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3 text-xs text-[var(--muted)] md:grid-cols-[1fr_1fr_auto]">
            <span>{t("portal.attendance.field.dateTime")}</span>
            <span className="hidden md:block">{t("portal.attendance.field.session")}</span>
            <span>{t("portal.attendance.field.status")}</span>
          </div>

          {isAttendanceLoading ? (
            <div className="grid gap-3" data-testid="portal-attendance-loading">
              {Array.from({ length: 6 }).map((_, index) => (
                <PortalSkeletonBlock key={index} className="h-20" />
              ))}
            </div>
          ) : attendanceError ? (
            <Card>
              <div className="space-y-3 text-center" data-testid="portal-attendance-error">
                <h2 className="text-base font-semibold text-[var(--text)]">
                  {t("portal.error.studentDetail.title")}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {t("portal.error.studentDetail.body")}
                </p>
                <button
                  type="button"
                  onClick={() => void loadAttendanceHistory()}
                  className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
                >
                  {t("portal.common.tryAgain")}
                </button>
              </div>
            </Card>
          ) : attendanceItems.length === 0 ? (
            <Card>
              <div className="space-y-3 text-center" data-testid="portal-attendance-empty">
                <h2 className="text-base font-semibold text-[var(--text)]">
                  {t("portal.empty.noAttendance.title")}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {t("portal.empty.noAttendance.body")}
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3" data-testid="portal-attendance-list">
              {attendanceItems.map((item) => (
                <AttendanceRow
                  key={item.id}
                  attendance={item}
                  href={
                    tenant
                      ? `/${tenant}/portal/sessions/${item.sessionId}`
                      : `/portal/sessions/${item.sessionId}`
                  }
                />
              ))}
            </div>
          )}

          {/* Attendance rows already render status labels; avoid extra summaries here. */}
        </div>
      )}
    </div>
  );
}

