// Client-side dashboard widgets that summarize key report data for admins.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { fetchJson } from "@/lib/api/fetchJson";

type UpcomingSessionsRow = {
  sessionId: string;
  startAt: string;
  endAt: string;
  sessionType: "ONE_ON_ONE" | "GROUP" | "CLASS";
  centerId: string;
  centerName: string;
  tutorId: string;
  tutorName: string | null;
  rosterCount: number;
};

type UpcomingSessionsResponse = {
  meta: {
    from: string;
    to: string;
    centerId?: string;
    tutorId?: string;
  };
  rows: UpcomingSessionsRow[];
};

type WeeklyAttendanceSummary = {
  rosterTotal: number;
  markedTotal: number;
  unsetTotal: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

type WeeklyAttendanceResponse = {
  meta: {
    weekStart: string;
    weekEnd: string;
    centerId?: string;
  };
  summary: WeeklyAttendanceSummary;
};

type StudentActivityRow = {
  studentId: string;
  studentName: string;
  sessionsScheduled: number;
  attendanceMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  lastSessionAt: string | null;
};

type StudentActivityResponse = {
  meta: {
    from: string;
    to: string;
    centerId?: string;
  };
  rows: StudentActivityRow[];
};

type AdminDashboardClientProps = {
  tenant: string;
};

const DEFAULT_LIMIT = 10;

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function getLocalWeekStart(date: Date) {
  // Week start uses Monday for consistent weekly summaries.
  const day = date.getDay();
  const diff = (day + 6) % 7;
  return addLocalDays(date, -diff);
}

function formatDateTime(iso: string, locale: string) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDateOnly(iso: string, locale: string) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}

function sessionTypeKey(type: UpcomingSessionsRow["sessionType"]) {
  switch (type) {
    case "ONE_ON_ONE":
      return "admin.sessions.types.oneOnOne";
    case "GROUP":
      return "admin.sessions.types.group";
    case "CLASS":
      return "admin.sessions.types.class";
  }
}

export default function AdminDashboardClient({
  tenant,
}: AdminDashboardClientProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const today = useMemo(() => new Date(), []);
  const upcomingFrom = useMemo(() => toLocalDateInputValue(today), [today]);
  const upcomingTo = useMemo(
    () => toLocalDateInputValue(addLocalDays(today, 7)),
    [today],
  );
  const studentFrom = useMemo(
    () => toLocalDateInputValue(addLocalDays(today, -30)),
    [today],
  );
  const studentTo = useMemo(() => toLocalDateInputValue(today), [today]);
  const weekStart = useMemo(
    () => toLocalDateInputValue(getLocalWeekStart(today)),
    [today],
  );

  const [upcomingRows, setUpcomingRows] = useState<UpcomingSessionsRow[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const [weeklySummary, setWeeklySummary] =
    useState<WeeklyAttendanceSummary | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const [studentRows, setStudentRows] = useState<StudentActivityRow[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentError, setStudentError] = useState<string | null>(null);

  const loadUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    setUpcomingError(null);

    const params = new URLSearchParams({
      from: upcomingFrom,
      to: upcomingTo,
      limit: `${DEFAULT_LIMIT}`,
    });

    const result = await fetchJson<UpcomingSessionsResponse>(
      `/api/reports/upcoming-sessions?${params.toString()}`,
    );

    if (!result.ok) {
      setUpcomingError(t("common.error"));
      setUpcomingLoading(false);
      return;
    }

    setUpcomingRows(result.data.rows);
    setUpcomingLoading(false);
  }, [t, upcomingFrom, upcomingTo]);

  const loadWeekly = useCallback(async () => {
    setWeeklyLoading(true);
    setWeeklyError(null);

    const params = new URLSearchParams({ weekStart });
    const result = await fetchJson<WeeklyAttendanceResponse>(
      `/api/reports/weekly-attendance?${params.toString()}`,
    );

    if (!result.ok) {
      setWeeklyError(t("common.error"));
      setWeeklyLoading(false);
      return;
    }

    setWeeklySummary(result.data.summary);
    setWeeklyLoading(false);
  }, [t, weekStart]);

  const loadStudentActivity = useCallback(async () => {
    setStudentLoading(true);
    setStudentError(null);

    const params = new URLSearchParams({
      from: studentFrom,
      to: studentTo,
      limit: `${DEFAULT_LIMIT}`,
    });

    const result = await fetchJson<StudentActivityResponse>(
      `/api/reports/student-activity?${params.toString()}`,
    );

    if (!result.ok) {
      setStudentError(t("common.error"));
      setStudentLoading(false);
      return;
    }

    setStudentRows(result.data.rows);
    setStudentLoading(false);
  }, [studentFrom, studentTo, t]);

  useEffect(() => {
    // Load dashboard widgets once on mount to avoid chatty refetching.
    const handle = setTimeout(() => {
      void loadUpcoming();
      void loadWeekly();
      void loadStudentActivity();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadUpcoming, loadWeekly, loadStudentActivity]);

  const upcomingColumns: AdminTableColumn<UpcomingSessionsRow>[] = [
    {
      header: t("admin.reports.table.upcoming.startAt"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {formatDateTime(row.startAt, locale)}
        </span>
      ),
    },
    {
      header: t("admin.reports.table.upcoming.center"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.centerName}</span>
      ),
    },
    {
      header: t("admin.reports.table.upcoming.tutor"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.tutorName ?? ""}</span>
      ),
    },
    {
      header: t("admin.reports.table.upcoming.sessionType"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {t(sessionTypeKey(row.sessionType))}
        </span>
      ),
    },
    {
      header: t("admin.reports.table.upcoming.rosterCount"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.rosterCount}</span>
      ),
    },
  ];

  const weeklyColumns: AdminTableColumn<WeeklyAttendanceSummary>[] = [
    {
      header: t("admin.reports.table.weekly.rosterTotal"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.rosterTotal}</span>
      ),
    },
    {
      header: t("admin.reports.table.weekly.markedTotal"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.markedTotal}</span>
      ),
    },
    {
      header: t("admin.reports.table.weekly.unsetTotal"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.unsetTotal}</span>
      ),
    },
    {
      header: t("admin.reports.table.weekly.present"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.present}</span>
      ),
    },
    {
      header: t("admin.reports.table.weekly.absent"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.absent}</span>
      ),
    },
    {
      header: t("admin.reports.table.weekly.late"),
      cell: (row) => <span className="text-sm text-slate-700">{row.late}</span>,
    },
    {
      header: t("admin.reports.table.weekly.excused"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.excused}</span>
      ),
    },
  ];

  const studentColumns: AdminTableColumn<StudentActivityRow>[] = [
    {
      header: t("admin.reports.table.studentActivity.studentName"),
      cell: (row) => (
        <span className="text-sm font-medium text-slate-900">
          {row.studentName}
        </span>
      ),
    },
    {
      header: t("admin.reports.table.studentActivity.sessionsScheduled"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.sessionsScheduled}</span>
      ),
    },
    {
      header: t("admin.reports.table.studentActivity.present"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.present}</span>
      ),
    },
    {
      header: t("admin.reports.table.studentActivity.absent"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.absent}</span>
      ),
    },
    {
      header: t("admin.reports.table.studentActivity.late"),
      cell: (row) => <span className="text-sm text-slate-700">{row.late}</span>,
    },
    {
      header: t("admin.reports.table.studentActivity.excused"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.excused}</span>
      ),
    },
    {
      header: t("admin.reports.table.studentActivity.lastSessionAt"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {row.lastSessionAt ? formatDateOnly(row.lastSessionAt, locale) : ""}
        </span>
      ),
    },
  ];

  const weeklyRows =
    weeklySummary && weeklySummary.rosterTotal > 0 ? [weeklySummary] : [];

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      // data-testid anchors the dashboard root for E2E without relying on text.
      data-testid="admin-dashboard-page"
    >
      <section
        className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 lg:col-span-2"
        // data-testid keeps the Upcoming Sessions widget stable in E2E.
        data-testid="upcoming-sessions-widget"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            {t("admin.dashboard.widgets.upcomingSessions.title")}
          </h2>
          <Link
            className="text-sm font-semibold text-amber-700 hover:text-amber-800"
            href={`/${tenant}/admin/sessions`}
            // data-testid keeps the View all Sessions link stable in E2E.
            data-testid="view-all-sessions-link"
          >
            {t("admin.dashboard.viewAll")}
          </Link>
        </div>
        {upcomingError ? (
          <p className="text-sm text-red-600">{upcomingError}</p>
        ) : null}
        <AdminTable
          rows={upcomingRows}
          columns={upcomingColumns}
          rowKey={(row) => `dashboard-upcoming-${row.sessionId}`}
          testId="dashboard-upcoming-table"
          isLoading={upcomingLoading}
          loadingState={t("common.loading")}
          emptyState={t("admin.dashboard.empty.upcomingSessions")}
        />
      </section>

      <section
        className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4"
        // data-testid keeps the Weekly Attendance widget stable in E2E.
        data-testid="weekly-attendance-widget"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            {t("admin.dashboard.widgets.weeklyAttendance.title")}
          </h2>
          <Link
            className="text-sm font-semibold text-amber-700 hover:text-amber-800"
            href={`/${tenant}/admin/reports`}
            // data-testid keeps the View full report link stable in E2E.
            data-testid="view-full-report-link"
          >
            {t("admin.dashboard.viewAll")}
          </Link>
        </div>
        {weeklyError ? (
          <p className="text-sm text-red-600">{weeklyError}</p>
        ) : null}
        <AdminTable
          rows={weeklyRows}
          columns={weeklyColumns}
          rowKey={(row) =>
            `dashboard-weekly-${row.rosterTotal}-${row.markedTotal}`
          }
          testId="dashboard-weekly-table"
          isLoading={weeklyLoading}
          loadingState={t("common.loading")}
          emptyState={t("admin.dashboard.empty.weeklyAttendance")}
        />
      </section>

      <section
        className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 lg:col-span-2"
        // data-testid keeps the Student Activity widget stable in E2E.
        data-testid="student-activity-widget"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            {t("admin.dashboard.widgets.studentActivity.title")}
          </h2>
          <Link
            className="text-sm font-semibold text-amber-700 hover:text-amber-800"
            href={`/${tenant}/admin/reports`}
          >
            {t("admin.dashboard.viewAll")}
          </Link>
        </div>
        {studentError ? (
          <p className="text-sm text-red-600">{studentError}</p>
        ) : null}
        <AdminTable
          rows={studentRows}
          columns={studentColumns}
          rowKey={(row) => `dashboard-student-${row.studentId}`}
          testId="dashboard-student-table"
          isLoading={studentLoading}
          loadingState={t("common.loading")}
          emptyState={t("admin.dashboard.empty.studentActivity")}
        />
      </section>

      <section
        className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4"
        // data-testid keeps the Quick Actions block stable in E2E.
        data-testid="quick-actions"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {t("admin.dashboard.actions.title")}
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/${tenant}/admin/centers`}
          >
            {t("admin.dashboard.actions.centers")}
          </Link>
          <Link
            className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/${tenant}/admin/users`}
          >
            {t("admin.dashboard.actions.users")}
          </Link>
          <Link
            className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/${tenant}/admin/programs`}
          >
            {t("admin.dashboard.actions.catalog")}
          </Link>
          <Link
            className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/${tenant}/admin/groups`}
          >
            {t("admin.dashboard.actions.groups")}
          </Link>
          <Link
            className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/${tenant}/admin/sessions`}
          >
            {t("admin.dashboard.actions.sessions")}
          </Link>
          <Link
            className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/${tenant}/admin/reports`}
          >
            {t("admin.dashboard.actions.reports")}
          </Link>
        </div>
      </section>
    </div>
  );
}
