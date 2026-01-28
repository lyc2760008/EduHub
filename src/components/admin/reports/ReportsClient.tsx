// Client-side reports UI that fetches report endpoints and renders admin tables.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { inputBase } from "@/components/admin/shared/adminUiClasses";
import { fetchJson } from "@/lib/api/fetchJson";

type CenterOption = {
  id: string;
  name: string;
};

type TutorOption = {
  id: string;
  name: string | null;
  email: string;
};

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

type ReportsClientProps = {
  centers: CenterOption[];
  tutors: TutorOption[];
};

type UpcomingFilters = {
  from: string;
  to: string;
  centerId: string;
  tutorId: string;
};

type WeeklyFilters = {
  weekStart: string;
  centerId: string;
};

type StudentFilters = {
  from: string;
  to: string;
  centerId: string;
};

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
  // Default weekStart to Monday for predictable weekly summaries.
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

// Debounce duration keeps filter-driven refetches responsive but not chatty.
const REPORTS_DEBOUNCE_MS = 300;

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

export default function ReportsClient({ centers, tutors }: ReportsClientProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const baseDate = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(
    () => toLocalDateInputValue(addLocalDays(baseDate, -30)),
    [baseDate],
  );
  const defaultTo = useMemo(() => toLocalDateInputValue(baseDate), [baseDate]);
  const defaultUpcomingTo = useMemo(
    () => toLocalDateInputValue(addLocalDays(baseDate, 14)),
    [baseDate],
  );
  const defaultWeekStart = useMemo(
    () => toLocalDateInputValue(getLocalWeekStart(baseDate)),
    [baseDate],
  );

  const [upcomingFilters, setUpcomingFilters] = useState<UpcomingFilters>({
    from: defaultTo,
    to: defaultUpcomingTo,
    centerId: "",
    tutorId: "",
  });
  const [weeklyFilters, setWeeklyFilters] = useState<WeeklyFilters>({
    weekStart: defaultWeekStart,
    centerId: "",
  });
  const [studentFilters, setStudentFilters] = useState<StudentFilters>({
    from: defaultFrom,
    to: defaultTo,
    centerId: "",
  });

  const [upcomingRows, setUpcomingRows] = useState<UpcomingSessionsRow[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const [weeklySummary, setWeeklySummary] =
    useState<WeeklyAttendanceSummary | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const [studentRows, setStudentRows] = useState<StudentActivityRow[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);

  const loadUpcoming = useCallback(async () => {
    setUpcomingLoading(true);
    setUpcomingError(null);

    const params = new URLSearchParams();
    if (upcomingFilters.from) params.set("from", upcomingFilters.from);
    if (upcomingFilters.to) params.set("to", upcomingFilters.to);
    if (upcomingFilters.centerId) {
      params.set("centerId", upcomingFilters.centerId);
    }
    if (upcomingFilters.tutorId) {
      params.set("tutorId", upcomingFilters.tutorId);
    }

    const url = params.size
      ? `/api/reports/upcoming-sessions?${params.toString()}`
      : "/api/reports/upcoming-sessions";
    const result = await fetchJson<UpcomingSessionsResponse>(url);

    if (!result.ok) {
      setUpcomingError(t("admin.reports.messages.error"));
      setUpcomingLoading(false);
      return;
    }

    setUpcomingRows(result.data.rows);
    setUpcomingLoading(false);
  }, [t, upcomingFilters]);

  const loadWeekly = useCallback(async () => {
    setWeeklyLoading(true);
    setWeeklyError(null);

    const params = new URLSearchParams();
    if (weeklyFilters.weekStart) {
      params.set("weekStart", weeklyFilters.weekStart);
    }
    if (weeklyFilters.centerId) {
      params.set("centerId", weeklyFilters.centerId);
    }

    const url = params.size
      ? `/api/reports/weekly-attendance?${params.toString()}`
      : "/api/reports/weekly-attendance";
    const result = await fetchJson<WeeklyAttendanceResponse>(url);

    if (!result.ok) {
      setWeeklyError(t("admin.reports.messages.error"));
      setWeeklyLoading(false);
      return;
    }

    setWeeklySummary(result.data.summary);
    setWeeklyLoading(false);
  }, [t, weeklyFilters]);

  const loadStudentActivity = useCallback(async () => {
    setStudentLoading(true);
    setStudentError(null);

    const params = new URLSearchParams();
    if (studentFilters.from) params.set("from", studentFilters.from);
    if (studentFilters.to) params.set("to", studentFilters.to);
    if (studentFilters.centerId) {
      params.set("centerId", studentFilters.centerId);
    }

    const url = params.size
      ? `/api/reports/student-activity?${params.toString()}`
      : "/api/reports/student-activity";
    const result = await fetchJson<StudentActivityResponse>(url);

    if (!result.ok) {
      setStudentError(t("admin.reports.messages.error"));
      setStudentLoading(false);
      return;
    }

    setStudentRows(result.data.rows);
    setStudentLoading(false);
  }, [studentFilters, t]);

  useEffect(() => {
    // Debounced auto-refresh keeps reports in sync without per-keystroke fetches.
    const handle = setTimeout(() => {
      void loadUpcoming();
    }, REPORTS_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [loadUpcoming]);

  useEffect(() => {
    // Debounced auto-refresh keeps reports in sync without per-keystroke fetches.
    const handle = setTimeout(() => {
      void loadWeekly();
    }, REPORTS_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [loadWeekly]);

  useEffect(() => {
    // Debounced auto-refresh keeps reports in sync without per-keystroke fetches.
    const handle = setTimeout(() => {
      void loadStudentActivity();
    }, REPORTS_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [loadStudentActivity]);

  const upcomingColumns: AdminTableColumn<UpcomingSessionsRow>[] = [
    {
      header: t("admin.reports.table.upcoming.startAt"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {formatDateTime(row.startAt, locale)}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.upcoming.endAt"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {formatDateTime(row.endAt, locale)}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.upcoming.center"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.centerName}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.upcoming.tutor"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.tutorName ?? ""}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.upcoming.sessionType"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {t(sessionTypeKey(row.sessionType))}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.upcoming.rosterCount"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.rosterCount}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const weeklyColumns: AdminTableColumn<WeeklyAttendanceSummary>[] = [
    {
      header: t("admin.reports.table.weekly.rosterTotal"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.rosterTotal}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.weekly.markedTotal"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.markedTotal}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.weekly.unsetTotal"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.unsetTotal}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.weekly.present"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.present}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.weekly.absent"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.absent}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.weekly.late"),
      cell: (row) => <span className="text-sm text-slate-700">{row.late}</span>,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.weekly.excused"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.excused}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
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
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.studentActivity.sessionsScheduled"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.sessionsScheduled}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.studentActivity.present"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.present}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.studentActivity.absent"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.absent}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.studentActivity.late"),
      cell: (row) => <span className="text-sm text-slate-700">{row.late}</span>,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.studentActivity.excused"),
      cell: (row) => (
        <span className="text-sm text-slate-700">{row.excused}</span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.reports.table.studentActivity.lastSessionAt"),
      cell: (row) => (
        <span className="text-sm text-slate-700">
          {row.lastSessionAt ? formatDateOnly(row.lastSessionAt, locale) : ""}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const weeklyRows = weeklySummary ? [weeklySummary] : [];

  return (
    <div className="flex flex-col gap-8">
      <section
        className="flex flex-col gap-4"
        // Test id keeps the Upcoming Sessions section targetable in E2E.
        data-testid="report-upcoming-sessions"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t("admin.reports.sections.upcomingSessions")}
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <AdminFormField
            label={t("admin.reports.filters.from")}
            htmlFor="reports-upcoming-from"
          >
            <input
              className={inputBase}
              id="reports-upcoming-from"
              type="date"
              value={upcomingFilters.from}
              // data-testid keeps date inputs stable for automated runs.
              data-testid="upcoming-date-from"
              onChange={(event) =>
                setUpcomingFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.to")}
            htmlFor="reports-upcoming-to"
          >
            <input
              className={inputBase}
              id="reports-upcoming-to"
              type="date"
              value={upcomingFilters.to}
              // data-testid keeps date inputs stable for automated runs.
              data-testid="upcoming-date-to"
              onChange={(event) =>
                setUpcomingFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.center")}
            htmlFor="reports-upcoming-center"
          >
            <select
              className={`${inputBase} min-w-[180px]`}
              id="reports-upcoming-center"
              value={upcomingFilters.centerId}
              // data-testid stabilizes center filter selection in E2E.
              data-testid="upcoming-center"
              onChange={(event) =>
                setUpcomingFilters((current) => ({
                  ...current,
                  centerId: event.target.value,
                }))
              }
            >
              <option value="">{t("admin.reports.filters.allCenters")}</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.tutor")}
            htmlFor="reports-upcoming-tutor"
          >
            <select
              className={`${inputBase} min-w-[180px]`}
              id="reports-upcoming-tutor"
              value={upcomingFilters.tutorId}
              // data-testid stabilizes tutor filter selection in E2E.
              data-testid="upcoming-tutor"
              onChange={(event) =>
                setUpcomingFilters((current) => ({
                  ...current,
                  tutorId: event.target.value,
                }))
              }
            >
              <option value="">{t("admin.reports.filters.allTutors")}</option>
              {tutors.map((tutor) => (
                <option key={tutor.id} value={tutor.id}>
                  {tutor.name ?? tutor.email}
                </option>
              ))}
            </select>
          </AdminFormField>
        </div>
        {upcomingError ? (
          <p className="text-sm text-red-600">{upcomingError}</p>
        ) : null}
        <AdminTable
          rows={upcomingRows}
          columns={upcomingColumns}
          rowKey={(row) => `reports-upcoming-${row.sessionId}`}
          // testId keeps the results table easy to target in E2E.
          testId="upcoming-results"
          isLoading={upcomingLoading}
          loadingState={t("admin.reports.messages.loading")}
          emptyState={t("admin.reports.messages.empty")}
        />
      </section>

      <section
        className="flex flex-col gap-4"
        // Test id keeps the Weekly Attendance section targetable in E2E.
        data-testid="report-weekly-attendance"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t("admin.reports.sections.weeklyAttendance")}
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <AdminFormField
            label={t("admin.reports.filters.weekStart")}
            htmlFor="reports-weekly-start"
          >
            <input
              className={inputBase}
              id="reports-weekly-start"
              type="date"
              value={weeklyFilters.weekStart}
              // data-testid keeps the week start input stable in E2E.
              data-testid="weekly-week-start"
              onChange={(event) =>
                setWeeklyFilters((current) => ({
                  ...current,
                  weekStart: event.target.value,
                }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.center")}
            htmlFor="reports-weekly-center"
          >
            <select
              className={`${inputBase} min-w-[180px]`}
              id="reports-weekly-center"
              value={weeklyFilters.centerId}
              // data-testid stabilizes weekly center selection in E2E.
              data-testid="weekly-center"
              onChange={(event) =>
                setWeeklyFilters((current) => ({
                  ...current,
                  centerId: event.target.value,
                }))
              }
            >
              <option value="">{t("admin.reports.filters.allCenters")}</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </AdminFormField>
        </div>
        {weeklyError ? (
          <p className="text-sm text-red-600">{weeklyError}</p>
        ) : null}
        <AdminTable
          rows={weeklyRows}
          columns={weeklyColumns}
          rowKey={(row) =>
            `reports-weekly-summary-${row.rosterTotal}-${row.markedTotal}`
          }
          // testId keeps the weekly summary table easy to target in E2E.
          testId="weekly-results"
          isLoading={weeklyLoading}
          loadingState={t("admin.reports.messages.loading")}
          emptyState={t("admin.reports.messages.empty")}
        />
      </section>

      <section
        className="flex flex-col gap-4"
        // Test id keeps the Student Activity section targetable in E2E.
        data-testid="report-student-activity"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t("admin.reports.sections.studentActivity")}
          </h2>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <AdminFormField
            label={t("admin.reports.filters.from")}
            htmlFor="reports-student-from"
          >
            <input
              className={inputBase}
              id="reports-student-from"
              type="date"
              value={studentFilters.from}
              // data-testid keeps date inputs stable for automated runs.
              data-testid="student-date-from"
              onChange={(event) =>
                setStudentFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.to")}
            htmlFor="reports-student-to"
          >
            <input
              className={inputBase}
              id="reports-student-to"
              type="date"
              value={studentFilters.to}
              // data-testid keeps date inputs stable for automated runs.
              data-testid="student-date-to"
              onChange={(event) =>
                setStudentFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.center")}
            htmlFor="reports-student-center"
          >
            <select
              className={`${inputBase} min-w-[180px]`}
              id="reports-student-center"
              value={studentFilters.centerId}
              // data-testid stabilizes student center selection in E2E.
              data-testid="student-center"
              onChange={(event) =>
                setStudentFilters((current) => ({
                  ...current,
                  centerId: event.target.value,
                }))
              }
            >
              <option value="">{t("admin.reports.filters.allCenters")}</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </AdminFormField>
        </div>
        {studentError ? (
          <p className="text-sm text-red-600">{studentError}</p>
        ) : null}
        <AdminTable
          rows={studentRows}
          columns={studentColumns}
          rowKey={(row) => `reports-student-${row.studentId}`}
          // testId keeps the student activity table easy to target in E2E.
          testId="student-results"
          isLoading={studentLoading}
          loadingState={t("admin.reports.messages.loading")}
          emptyState={t("admin.reports.messages.empty")}
        />
      </section>
    </div>
  );
}
