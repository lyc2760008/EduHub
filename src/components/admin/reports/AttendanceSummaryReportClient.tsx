"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminTableToolkit, {
  type AdminToolkitCardField,
  type AdminToolkitColumn,
  type AdminToolkitCsvColumn,
  type AdminToolkitFilterChip,
} from "@/components/admin/shared/AdminTableToolkit";
import { inputBase } from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import type {
  AdminReportGroupOption,
  AdminReportTutorOption,
} from "@/lib/reports/adminReportOptions";

type AttendancePreset = "7d" | "30d" | "60d" | "90d";
type StudentStatusFilter = "ACTIVE" | "INACTIVE" | "ALL";

type AttendanceRow = {
  studentId: string;
  studentName: string;
  programLevel: string | null;
  groupName: string | null;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedAbsentCount: number;
  absenceRatePercent: number;
  studentStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED";
};

type AttendanceResponse = {
  rows: AttendanceRow[];
};

type AttendanceSummaryReportClientProps = {
  tenant: string;
  groups: AdminReportGroupOption[];
  tutors: AdminReportTutorOption[];
};

const DEFAULT_PRESET: AttendancePreset = "30d";
const DEFAULT_STATUS: StudentStatusFilter = "ALL";

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function AttendanceSummaryReportClient({
  tenant,
  groups,
  tutors,
}: AttendanceSummaryReportClientProps) {
  const t = useTranslations();

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [preset, setPreset] = useState<AttendancePreset>(DEFAULT_PRESET);
  const [groupId, setGroupId] = useState("");
  const [tutorId, setTutorId] = useState("");
  const [studentStatus, setStudentStatus] =
    useState<StudentStatusFilter>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      preset,
      studentStatus,
    });
    if (groupId) params.set("groupId", groupId);
    if (tutorId) params.set("tutorId", tutorId);

    const result = await fetchJson<AttendanceResponse>(
      buildTenantApiUrl(tenant, `/admin/reports/attendance-summary?${params}`),
    );

    if (!result.ok) {
      setError(t("admin.table.state.error.body"));
      setIsLoading(false);
      return;
    }

    setRows(result.data.rows ?? []);
    setIsLoading(false);
  }, [groupId, preset, studentStatus, t, tenant, tutorId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRows, reloadNonce]);

  const resetFilters = () => {
    setPreset(DEFAULT_PRESET);
    setGroupId("");
    setTutorId("");
    setStudentStatus(DEFAULT_STATUS);
  };

  const filterChips = useMemo<AdminToolkitFilterChip[]>(() => {
    const chips: AdminToolkitFilterChip[] = [];
    if (preset !== DEFAULT_PRESET) {
      chips.push({
        key: "preset",
        label: t("admin.reports.filters.dateRange"),
        value: t(`admin.reports.range.last.${preset}`),
        onRemove: () => setPreset(DEFAULT_PRESET),
      });
    }
    if (groupId) {
      chips.push({
        key: "groupId",
        label: t("admin.reports.filters.groupClass"),
        value: groups.find((option) => option.id === groupId)?.name ?? groupId,
        onRemove: () => setGroupId(""),
      });
    }
    if (tutorId) {
      chips.push({
        key: "tutorId",
        label: t("admin.reports.filters.tutor"),
        value: tutors.find((option) => option.id === tutorId)?.name ?? tutorId,
        onRemove: () => setTutorId(""),
      });
    }
    if (studentStatus !== DEFAULT_STATUS) {
      chips.push({
        key: "studentStatus",
        label: t("admin.reports.filters.studentStatus"),
        value: t(`admin.reports.statusFilter.${studentStatus.toLowerCase()}`),
        onRemove: () => setStudentStatus(DEFAULT_STATUS),
      });
    }
    return chips;
  }, [groupId, groups, preset, studentStatus, t, tutorId, tutors]);

  const columns = useMemo<AdminToolkitColumn<AttendanceRow>[]>(
    () => [
      {
        key: "studentName",
        label: t("admin.reports.attendance.columns.studentName"),
        sortable: true,
        getSortValue: (row) => row.studentName,
        renderCell: (row) => (
          <span className="text-sm font-medium text-slate-900">{row.studentName}</span>
        ),
      },
      {
        key: "programLevel",
        label: t("admin.reports.attendance.columns.programLevel"),
        sortable: true,
        getSortValue: (row) => row.programLevel ?? "",
        renderCell: (row) => (
          <span className="text-sm text-slate-800">
            {row.programLevel ?? t("generic.dash")}
          </span>
        ),
      },
      {
        key: "groupName",
        label: t("admin.reports.attendance.columns.groupClass"),
        sortable: true,
        getSortValue: (row) => row.groupName ?? "",
        renderCell: (row) => (
          <span className="text-sm text-slate-800">{row.groupName ?? t("generic.dash")}</span>
        ),
      },
      {
        key: "totalSessions",
        label: t("admin.reports.attendance.columns.totalSessions"),
        sortable: true,
        getSortValue: (row) => row.totalSessions,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.totalSessions}</span>,
      },
      {
        key: "presentCount",
        label: t("admin.reports.attendance.columns.presentCount"),
        sortable: true,
        getSortValue: (row) => row.presentCount,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.presentCount}</span>,
      },
      {
        key: "absentCount",
        label: t("admin.reports.attendance.columns.absentCount"),
        sortable: true,
        getSortValue: (row) => row.absentCount,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.absentCount}</span>,
      },
      {
        key: "lateCount",
        label: t("admin.reports.attendance.columns.lateCount"),
        sortable: true,
        getSortValue: (row) => row.lateCount,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.lateCount}</span>,
      },
      {
        key: "excusedCount",
        label: t("admin.reports.attendance.columns.excusedCount"),
        sortable: true,
        getSortValue: (row) => row.excusedAbsentCount,
        renderCell: (row) => (
          <span className="text-sm text-slate-800">{row.excusedAbsentCount}</span>
        ),
      },
      {
        key: "absenceRate",
        label: t("admin.reports.attendance.columns.absenceRate"),
        sortable: true,
        getSortValue: (row) => row.absenceRatePercent,
        renderCell: (row) => (
          <span className="text-sm font-semibold text-slate-900">
            {formatRate(row.absenceRatePercent)}
          </span>
        ),
      },
    ],
    [t],
  );

  const cardFields = useMemo<AdminToolkitCardField<AttendanceRow>[]>(
    () => [
      {
        key: "studentName",
        label: t("admin.reports.attendance.columns.studentName"),
        renderValue: (row) => row.studentName,
      },
      {
        key: "groupName",
        label: t("admin.reports.attendance.columns.groupClass"),
        renderValue: (row) => row.groupName ?? t("generic.dash"),
      },
      {
        key: "totalSessions",
        label: t("admin.reports.attendance.columns.totalSessions"),
        renderValue: (row) => row.totalSessions,
      },
      {
        key: "absenceRate",
        label: t("admin.reports.attendance.columns.absenceRate"),
        renderValue: (row) => formatRate(row.absenceRatePercent),
      },
    ],
    [t],
  );

  const csvColumns = useMemo<AdminToolkitCsvColumn<AttendanceRow>[]>(
    () => [
      {
        key: "studentName",
        header: t("admin.reports.attendance.columns.studentName"),
        getValue: (row) => row.studentName,
      },
      {
        key: "programLevel",
        header: t("admin.reports.attendance.columns.programLevel"),
        getValue: (row) => row.programLevel ?? "",
      },
      {
        key: "groupName",
        header: t("admin.reports.attendance.columns.groupClass"),
        getValue: (row) => row.groupName ?? "",
      },
      {
        key: "totalSessions",
        header: t("admin.reports.attendance.columns.totalSessions"),
        getValue: (row) => row.totalSessions,
      },
      {
        key: "presentCount",
        header: t("admin.reports.attendance.columns.presentCount"),
        getValue: (row) => row.presentCount,
      },
      {
        key: "absentCount",
        header: t("admin.reports.attendance.columns.absentCount"),
        getValue: (row) => row.absentCount,
      },
      {
        key: "lateCount",
        header: t("admin.reports.attendance.columns.lateCount"),
        getValue: (row) => row.lateCount,
      },
      {
        key: "excusedCount",
        header: t("admin.reports.attendance.columns.excusedCount"),
        getValue: (row) => row.excusedAbsentCount,
      },
      {
        key: "absenceRate",
        header: t("admin.reports.attendance.columns.absenceRate"),
        getValue: (row) => formatRate(row.absenceRatePercent),
      },
    ],
    [t],
  );

  return (
    <AdminTableToolkit<AttendanceRow>
      testId="report-attendance-summary"
      rows={rows}
      rowKey={(row) => `attendance-row-${row.studentId}`}
      columns={columns}
      cardFields={cardFields}
      csvColumns={csvColumns}
      defaultSort={{ key: "absenceRate", direction: "desc" }}
      getSearchText={(row) =>
        [row.studentName, row.groupName ?? "", row.programLevel ?? ""].join(" ")
      }
      filterChips={filterChips}
      onResetFilters={resetFilters}
      filterContent={
        <>
          <AdminFormField
            label={t("admin.reports.filters.dateRange")}
            htmlFor="attendance-preset"
          >
            <select
              id="attendance-preset"
              className={inputBase}
              value={preset}
              onChange={(event) => setPreset(event.target.value as AttendancePreset)}
            >
              <option value="7d">{t("admin.reports.range.last.7d")}</option>
              <option value="30d">{t("admin.reports.range.last.30d")}</option>
              <option value="60d">{t("admin.reports.range.last.60d")}</option>
              <option value="90d">{t("admin.reports.range.last.90d")}</option>
            </select>
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.groupClass")}
            htmlFor="attendance-group"
          >
            <select
              id="attendance-group"
              className={inputBase}
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
            >
              <option value="">{t("admin.reports.filters.allGroups")}</option>
              {groups.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </AdminFormField>
          <AdminFormField label={t("admin.reports.filters.tutor")} htmlFor="attendance-tutor">
            <select
              id="attendance-tutor"
              className={inputBase}
              value={tutorId}
              onChange={(event) => setTutorId(event.target.value)}
            >
              <option value="">{t("admin.reports.filters.allTutors")}</option>
              {tutors.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.studentStatus")}
            htmlFor="attendance-student-status"
          >
            <select
              id="attendance-student-status"
              className={inputBase}
              value={studentStatus}
              onChange={(event) =>
                setStudentStatus(event.target.value as StudentStatusFilter)
              }
            >
              <option value="ACTIVE">{t("admin.reports.statusFilter.active")}</option>
              <option value="INACTIVE">{t("admin.reports.statusFilter.inactive")}</option>
              <option value="ALL">{t("admin.reports.statusFilter.all")}</option>
            </select>
          </AdminFormField>
        </>
      }
      emptyState={{
        title: t("admin.reports.attendance.empty.title"),
        body: t("admin.reports.attendance.empty.body"),
        ctaLabel: t("admin.reports.attendance.empty.cta"),
        onCta: resetFilters,
      }}
      exportFileName={t("admin.reports.attendance.export.filename")}
      isLoading={isLoading}
      error={error}
      onRetry={() => setReloadNonce((current) => current + 1)}
    />
  );
}
