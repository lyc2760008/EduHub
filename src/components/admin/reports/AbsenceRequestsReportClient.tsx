// Absence requests report uses unified reporting APIs with URL-synced filters/sort/pagination/export.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { RequestStatus } from "@/generated/prisma/client";
import type {
  AdminReportStudentOption,
  AdminReportTutorOption,
} from "@/lib/reports/adminReportOptions";
import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminPagination from "@/components/admin/shared/AdminPagination";
import AdminTableToolbar, {
  type AdminFilterChip,
} from "@/components/admin/shared/AdminTableToolbar";
import {
  AdminErrorPanel,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import { inputBase } from "@/components/admin/shared/adminUiClasses";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";
import { useAdminReportTable } from "@/components/admin/reports/useAdminReportTable";

type RequestPreset = "today" | "7d" | "30d" | "90d";

type AbsenceRequestRow = {
  id: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  studentName: string;
  parentEmail: string;
  sessionStartAt: string;
  tutorName: string;
};

type AbsenceRequestsReportClientProps = {
  tenant: string;
  tutors: AdminReportTutorOption[];
  students: AdminReportStudentOption[];
};

const DEFAULT_PRESET: RequestPreset = "30d";
const DEFAULT_STATUS = "PENDING";

function dateToYyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildLastRangePreset(preset: RequestPreset) {
  const today = new Date();
  const dayStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (preset === "today") {
    return { from: dateToYyyyMmDd(dayStart), to: dateToYyyyMmDd(dayStart) };
  }
  if (preset === "7d") {
    return { from: dateToYyyyMmDd(addDays(dayStart, -6)), to: dateToYyyyMmDd(dayStart) };
  }
  if (preset === "90d") {
    return { from: dateToYyyyMmDd(addDays(dayStart, -89)), to: dateToYyyyMmDd(dayStart) };
  }
  return { from: dateToYyyyMmDd(addDays(dayStart, -29)), to: dateToYyyyMmDd(dayStart) };
}

function detectLastPreset(from?: string, to?: string): RequestPreset | null {
  if (!from || !to) return null;
  const presets: RequestPreset[] = ["today", "7d", "30d", "90d"];
  return (
    presets.find((preset) => {
      const range = buildLastRangePreset(preset);
      return range.from === from && range.to === to;
    }) ?? null
  );
}

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatAge(createdAt: string, status: RequestStatus, t: ReturnType<typeof useTranslations>) {
  if (status !== "PENDING") return t("generic.dash");
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return t("generic.dash");
  const hours = Math.max(0, Math.round((Date.now() - created.getTime()) / (1000 * 60 * 60)));
  if (hours < 24) return t("admin.reports.common.hours", { count: hours });
  return t("admin.reports.common.days", { count: Math.floor(hours / 24) });
}

function getStatusKey(status: RequestStatus) {
  if (status === "PENDING") return "admin.status.pending";
  if (status === "APPROVED") return "admin.status.approved";
  if (status === "DECLINED") return "admin.status.declined";
  return "admin.status.withdrawn";
}

export default function AbsenceRequestsReportClient({
  tenant,
  tutors,
  students,
}: AbsenceRequestsReportClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "createdAt",
      defaultSortDir: "desc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["from", "to", "status", "tutorId", "studentId"],
    });

  // Default status/range stay URL-backed so operations teams can share report links safely.
  useEffect(() => {
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    if (!status) {
      setFilter("status", DEFAULT_STATUS);
    }
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    if (!from && !to) {
      const range = buildLastRangePreset(DEFAULT_PRESET);
      setFilter("from", range.from);
      setFilter("to", range.to);
    }
  }, [setFilter, state.filters.from, state.filters.status, state.filters.to]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const {
    rows,
    totalCount,
    isLoading,
    error,
    exportError,
    isExporting,
    reload,
    exportCsv,
  } = useAdminReportTable<AbsenceRequestRow>({
    tenant,
    reportId: "requests",
    tableState: state,
  });

  const currentPreset = detectLastPreset(
    typeof state.filters.from === "string" ? state.filters.from : undefined,
    typeof state.filters.to === "string" ? state.filters.to : undefined,
  );

  const clearAll = useCallback(() => {
    clearFilters();
    setSearch("");
    setSearchInput("");
    setFilter("status", DEFAULT_STATUS);
    const range = buildLastRangePreset(DEFAULT_PRESET);
    setFilter("from", range.from);
    setFilter("to", range.to);
  }, [clearFilters, setFilter, setSearch]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    if (currentPreset && currentPreset !== DEFAULT_PRESET) {
      chips.push({
        key: "preset",
        label: t("admin.reports.filters.dateRange"),
        value: t(`admin.reports.range.last.${currentPreset}`),
        onRemove: () => {
          const range = buildLastRangePreset(DEFAULT_PRESET);
          setFilter("from", range.from);
          setFilter("to", range.to);
        },
      });
    }
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    if (status && status !== DEFAULT_STATUS) {
      chips.push({
        key: "status",
        label: t("admin.reports.filters.status"),
        value:
          status === "ALL"
            ? t("admin.reports.statusFilter.all")
            : t(getStatusKey(status as RequestStatus)),
        onRemove: () => setFilter("status", DEFAULT_STATUS),
      });
    }
    const tutorId =
      typeof state.filters.tutorId === "string" ? state.filters.tutorId : "";
    if (tutorId) {
      chips.push({
        key: "tutorId",
        label: t("admin.reports.filters.tutor"),
        value: tutors.find((option) => option.id === tutorId)?.name ?? tutorId,
        onRemove: () => setFilter("tutorId", ""),
      });
    }
    const studentId =
      typeof state.filters.studentId === "string" ? state.filters.studentId : "";
    if (studentId) {
      chips.push({
        key: "studentId",
        label: t("admin.reports.filters.student"),
        value: students.find((option) => option.id === studentId)?.name ?? studentId,
        onRemove: () => setFilter("studentId", ""),
      });
    }
    if (state.search.trim()) {
      chips.unshift({
        key: "search",
        label: t("admin.table.search.label"),
        value: state.search.trim(),
        onRemove: () => setSearch(""),
      });
    }
    return chips;
  }, [
    currentPreset,
    setFilter,
    setSearch,
    state.filters.status,
    state.filters.studentId,
    state.filters.tutorId,
    state.search,
    students,
    t,
    tutors,
  ]);

  const columns = useMemo<AdminDataTableColumn<AbsenceRequestRow>[]>(
    () => [
      {
        key: "createdAt",
        sortField: "createdAt",
        sortable: true,
        label: t("admin.reports.requests.columns.createdTime"),
        renderCell: (row) => formatDateTime(row.createdAt, locale),
      },
      {
        key: "sessionStartAt",
        label: t("admin.reports.requests.columns.sessionDateTime"),
        renderCell: (row) => formatDateTime(row.sessionStartAt, locale),
      },
      {
        key: "studentName",
        label: t("admin.reports.requests.columns.studentName"),
        renderCell: (row) => row.studentName,
      },
      {
        key: "parentEmail",
        label: t("admin.reports.requests.columns.parent"),
        renderCell: (row) => row.parentEmail,
      },
      {
        key: "status",
        sortField: "status",
        sortable: true,
        label: t("admin.reports.requests.columns.status"),
        renderCell: (row) => t(getStatusKey(row.status)),
      },
      {
        key: "age",
        label: t("admin.reports.requests.columns.age"),
        renderCell: (row) => formatAge(row.createdAt, row.status, t),
      },
      {
        key: "tutorName",
        label: t("admin.reports.upcoming.columns.tutor"),
        renderCell: (row) => row.tutorName,
      },
      {
        key: "updatedAt",
        sortField: "updatedAt",
        sortable: true,
        label: t("admin.reports.requests.columns.lastUpdated"),
        renderCell: (row) => formatDateTime(row.updatedAt, locale),
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.reports.requests.empty.title"),
      body: t("admin.reports.requests.empty.body"),
      ctaLabel: t("admin.reports.requests.empty.cta"),
      onCta: () => setFilter("status", "ALL"),
    }),
    [setFilter, t],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="report-absence-requests">
      <AdminTableToolbar
        searchId="absence-requests-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        showExportButton
        onExportCsv={() => void exportCsv()}
        isExporting={isExporting}
        exportDisabled={isLoading || Boolean(error)}
      />

      {error ? <AdminErrorPanel onRetry={reload} /> : null}
      {exportError ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </p>
      ) : null}

      {!error ? (
        <>
          <AdminDataTable<AbsenceRequestRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `report-request-${row.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            testId="report-absence-requests-table"
          />
          <AdminPagination
            page={state.page}
            pageSize={state.pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : null}

      <AdminFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        onReset={clearAll}
      >
        <AdminFormField label={t("admin.reports.filters.status")} htmlFor="requests-status">
          <select
            id="requests-status"
            className={inputBase}
            value={typeof state.filters.status === "string" ? state.filters.status : DEFAULT_STATUS}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="PENDING">{t("admin.status.pending")}</option>
            <option value="APPROVED">{t("admin.status.approved")}</option>
            <option value="DECLINED">{t("admin.status.declined")}</option>
            <option value="WITHDRAWN">{t("admin.status.withdrawn")}</option>
            <option value="ALL">{t("admin.reports.statusFilter.all")}</option>
          </select>
        </AdminFormField>
        <AdminFormField label={t("admin.reports.filters.dateRange")} htmlFor="requests-preset">
          <select
            id="requests-preset"
            className={inputBase}
            value={currentPreset ?? DEFAULT_PRESET}
            onChange={(event) => {
              const preset = event.target.value as RequestPreset;
              const range = buildLastRangePreset(preset);
              setFilter("from", range.from);
              setFilter("to", range.to);
            }}
          >
            <option value="today">{t("admin.reports.range.last.today")}</option>
            <option value="7d">{t("admin.reports.range.last.7d")}</option>
            <option value="30d">{t("admin.reports.range.last.30d")}</option>
            <option value="90d">{t("admin.reports.range.last.90d")}</option>
          </select>
        </AdminFormField>
        <AdminFormField label={t("admin.reports.filters.tutor")} htmlFor="requests-tutor">
          <select
            id="requests-tutor"
            className={inputBase}
            value={typeof state.filters.tutorId === "string" ? state.filters.tutorId : ""}
            onChange={(event) => setFilter("tutorId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allTutors")}</option>
            {tutors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField label={t("admin.reports.filters.student")} htmlFor="requests-student">
          <select
            id="requests-student"
            className={inputBase}
            value={typeof state.filters.studentId === "string" ? state.filters.studentId : ""}
            onChange={(event) => setFilter("studentId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allStudents")}</option>
            {students.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </AdminFormField>
      </AdminFiltersSheet>
    </div>
  );
}
