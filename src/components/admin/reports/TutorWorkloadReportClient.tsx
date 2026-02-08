"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

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
  AdminReportCenterOption,
  AdminReportGroupOption,
} from "@/lib/reports/adminReportOptions";

type WeekPreset = "thisWeek" | "nextWeek";

type WorkloadRow = {
  tutorId: string;
  tutorName: string;
  totalSessions: number;
  totalMinutes: number;
  distinctStudents: number;
  distinctGroups: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  groupNames: string[];
};

type WorkloadResponse = {
  rows: WorkloadRow[];
};

type TutorWorkloadReportClientProps = {
  tenant: string;
  groups: AdminReportGroupOption[];
  centers: AdminReportCenterOption[];
};

const DEFAULT_WEEK: WeekPreset = "thisWeek";

function formatDateTime(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function TutorWorkloadReportClient({
  tenant,
  groups,
  centers,
}: TutorWorkloadReportClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [rows, setRows] = useState<WorkloadRow[]>([]);
  const [week, setWeek] = useState<WeekPreset>(DEFAULT_WEEK);
  const [groupId, setGroupId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ week });
    if (groupId) params.set("groupId", groupId);
    if (centerId) params.set("centerId", centerId);

    const result = await fetchJson<WorkloadResponse>(
      buildTenantApiUrl(tenant, `/admin/reports/tutor-workload?${params}`),
    );

    if (!result.ok) {
      setError(t("admin.table.state.error.body"));
      setIsLoading(false);
      return;
    }

    setRows(result.data.rows ?? []);
    setIsLoading(false);
  }, [centerId, groupId, t, tenant, week]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRows, reloadNonce]);

  const resetFilters = () => {
    setWeek(DEFAULT_WEEK);
    setGroupId("");
    setCenterId("");
  };

  const filterChips = useMemo<AdminToolkitFilterChip[]>(() => {
    const chips: AdminToolkitFilterChip[] = [];
    if (week !== DEFAULT_WEEK) {
      chips.push({
        key: "week",
        label: t("admin.reports.filters.week"),
        value: t(`admin.reports.workload.week.${week}`),
        onRemove: () => setWeek(DEFAULT_WEEK),
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
    if (centerId) {
      chips.push({
        key: "centerId",
        label: t("admin.reports.filters.center"),
        value: centers.find((option) => option.id === centerId)?.name ?? centerId,
        onRemove: () => setCenterId(""),
      });
    }
    return chips;
  }, [centerId, centers, groupId, groups, t, week]);

  const columns = useMemo<AdminToolkitColumn<WorkloadRow>[]>(
    () => [
      {
        key: "tutorName",
        label: t("admin.reports.workload.columns.tutorName"),
        sortable: true,
        getSortValue: (row) => row.tutorName,
        renderCell: (row) => <span className="text-sm font-medium text-slate-900">{row.tutorName}</span>,
      },
      {
        key: "totalSessions",
        label: t("admin.reports.workload.columns.totalSessions"),
        sortable: true,
        getSortValue: (row) => row.totalSessions,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.totalSessions}</span>,
      },
      {
        key: "totalMinutes",
        label: t("admin.reports.workload.columns.totalMinutes"),
        sortable: true,
        getSortValue: (row) => row.totalMinutes,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.totalMinutes}</span>,
      },
      {
        key: "distinctStudents",
        label: t("admin.reports.workload.columns.distinctStudents"),
        sortable: true,
        getSortValue: (row) => row.distinctStudents,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.distinctStudents}</span>,
      },
      {
        key: "distinctGroups",
        label: t("admin.reports.workload.columns.distinctGroups"),
        sortable: true,
        getSortValue: (row) => row.distinctGroups,
        renderCell: (row) => <span className="text-sm text-slate-800">{row.distinctGroups}</span>,
      },
      {
        key: "firstSessionAt",
        label: t("admin.reports.workload.columns.firstSession"),
        sortable: true,
        getSortValue: (row) => row.firstSessionAt ?? "",
        renderCell: (row) => (
          <span className="text-sm text-slate-800">
            {formatDateTime(row.firstSessionAt, locale, t("generic.dash"))}
          </span>
        ),
      },
      {
        key: "lastSessionAt",
        label: t("admin.reports.workload.columns.lastSession"),
        sortable: true,
        getSortValue: (row) => row.lastSessionAt ?? "",
        renderCell: (row) => (
          <span className="text-sm text-slate-800">
            {formatDateTime(row.lastSessionAt, locale, t("generic.dash"))}
          </span>
        ),
      },
    ],
    [locale, t],
  );

  const cardFields = useMemo<AdminToolkitCardField<WorkloadRow>[]>(
    () => [
      {
        key: "tutorName",
        label: t("admin.reports.workload.columns.tutorName"),
        renderValue: (row) => row.tutorName,
      },
      {
        key: "totalMinutes",
        label: t("admin.reports.workload.columns.totalMinutes"),
        renderValue: (row) => row.totalMinutes,
      },
      {
        key: "totalSessions",
        label: t("admin.reports.workload.columns.totalSessions"),
        renderValue: (row) => row.totalSessions,
      },
      {
        key: "distinctStudents",
        label: t("admin.reports.workload.columns.distinctStudents"),
        renderValue: (row) => row.distinctStudents,
      },
    ],
    [t],
  );

  const csvColumns = useMemo<AdminToolkitCsvColumn<WorkloadRow>[]>(
    () => [
      {
        key: "tutorName",
        header: t("admin.reports.workload.columns.tutorName"),
        getValue: (row) => row.tutorName,
      },
      {
        key: "totalSessions",
        header: t("admin.reports.workload.columns.totalSessions"),
        getValue: (row) => row.totalSessions,
      },
      {
        key: "totalMinutes",
        header: t("admin.reports.workload.columns.totalMinutes"),
        getValue: (row) => row.totalMinutes,
      },
      {
        key: "distinctStudents",
        header: t("admin.reports.workload.columns.distinctStudents"),
        getValue: (row) => row.distinctStudents,
      },
      {
        key: "distinctGroups",
        header: t("admin.reports.workload.columns.distinctGroups"),
        getValue: (row) => row.distinctGroups,
      },
      {
        key: "firstSessionAt",
        header: t("admin.reports.workload.columns.firstSession"),
        getValue: (row) => formatDateTime(row.firstSessionAt, locale, ""),
      },
      {
        key: "lastSessionAt",
        header: t("admin.reports.workload.columns.lastSession"),
        getValue: (row) => formatDateTime(row.lastSessionAt, locale, ""),
      },
    ],
    [locale, t],
  );

  return (
    <AdminTableToolkit<WorkloadRow>
      testId="report-tutor-workload"
      rows={rows}
      rowKey={(row) => `workload-row-${row.tutorId}`}
      columns={columns}
      cardFields={cardFields}
      csvColumns={csvColumns}
      defaultSort={{ key: "totalMinutes", direction: "desc" }}
      getSearchText={(row) => [row.tutorName, ...row.groupNames].join(" ")}
      filterChips={filterChips}
      onResetFilters={resetFilters}
      filterContent={
        <>
          <AdminFormField label={t("admin.reports.filters.week")} htmlFor="workload-week">
            <select
              id="workload-week"
              className={inputBase}
              value={week}
              onChange={(event) => setWeek(event.target.value as WeekPreset)}
            >
              <option value="thisWeek">{t("admin.reports.workload.week.thisWeek")}</option>
              <option value="nextWeek">{t("admin.reports.workload.week.nextWeek")}</option>
            </select>
          </AdminFormField>
          <AdminFormField
            label={t("admin.reports.filters.groupClass")}
            htmlFor="workload-group"
          >
            <select
              id="workload-group"
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
          <AdminFormField label={t("admin.reports.filters.center")} htmlFor="workload-center">
            <select
              id="workload-center"
              className={inputBase}
              value={centerId}
              onChange={(event) => setCenterId(event.target.value)}
            >
              <option value="">{t("admin.reports.filters.allCenters")}</option>
              {centers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </AdminFormField>
        </>
      }
      emptyState={{
        title: t("admin.reports.workload.empty.title"),
        body: t("admin.reports.workload.empty.body"),
      }}
      exportFileName={t("admin.reports.workload.export.filename")}
      isLoading={isLoading}
      error={error}
      onRetry={() => setReloadNonce((current) => current + 1)}
    />
  );
}
