// Upcoming sessions report uses shared admin table primitives with URL-synced query params.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { SessionType } from "@/generated/prisma/client";
import type { AdminReportCenterOption, AdminReportGroupOption, AdminReportTutorOption } from "@/lib/reports/adminReportOptions";
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

type UpcomingPreset = "today" | "7d" | "14d" | "30d";

type UpcomingSessionRow = {
  id: string;
  startAt: string;
  endAt: string;
  sessionType: SessionType;
  centerName: string;
  tutorName: string;
  groupName: string | null;
  programName: string | null;
  rosterCount: number;
};

type UpcomingSessionsReportClientProps = {
  tenant: string;
  tutors: AdminReportTutorOption[];
  groups: AdminReportGroupOption[];
  centers: AdminReportCenterOption[];
};

const DEFAULT_PRESET: UpcomingPreset = "14d";

function dateToYyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildPresetRange(preset: UpcomingPreset) {
  const today = new Date();
  const dayStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (preset === "today") {
    return { from: dateToYyyyMmDd(dayStart), to: dateToYyyyMmDd(dayStart) };
  }
  if (preset === "7d") {
    return { from: dateToYyyyMmDd(dayStart), to: dateToYyyyMmDd(addDays(dayStart, 6)) };
  }
  if (preset === "30d") {
    return { from: dateToYyyyMmDd(dayStart), to: dateToYyyyMmDd(addDays(dayStart, 29)) };
  }
  return { from: dateToYyyyMmDd(dayStart), to: dateToYyyyMmDd(addDays(dayStart, 13)) };
}

function detectPreset(from?: string, to?: string): UpcomingPreset | null {
  if (!from || !to) return null;
  const presets: UpcomingPreset[] = ["today", "7d", "14d", "30d"];
  const match = presets.find((preset) => {
    const range = buildPresetRange(preset);
    return range.from === from && range.to === to;
  });
  return match ?? null;
}

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatDurationMinutes(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function getSessionTypeKey(type: SessionType) {
  if (type === "ONE_ON_ONE") return "admin.sessions.types.oneOnOne";
  if (type === "GROUP") return "admin.sessions.types.group";
  return "admin.sessions.types.class";
}

export default function UpcomingSessionsReportClient({
  tenant,
  tutors,
  groups,
  centers,
}: UpcomingSessionsReportClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "startAt",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["from", "to", "tutorId", "groupId", "centerId"],
    });

  // Default range is injected into URL-backed filters so reload/back stays deterministic.
  useEffect(() => {
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    if (from || to) return;
    const range = buildPresetRange(DEFAULT_PRESET);
    setFilter("from", range.from);
    setFilter("to", range.to);
  }, [setFilter, state.filters.from, state.filters.to]);

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
  } = useAdminReportTable<UpcomingSessionRow>({
    tenant,
    reportId: "sessions",
    tableState: state,
  });

  const currentPreset = detectPreset(
    typeof state.filters.from === "string" ? state.filters.from : undefined,
    typeof state.filters.to === "string" ? state.filters.to : undefined,
  );

  const clearAll = useCallback(() => {
    clearFilters();
    const range = buildPresetRange(DEFAULT_PRESET);
    setFilter("from", range.from);
    setFilter("to", range.to);
    setSearch("");
    setSearchInput("");
  }, [clearFilters, setFilter, setSearch]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    if (currentPreset && currentPreset !== DEFAULT_PRESET) {
      chips.push({
        key: "preset",
        label: t("admin.reports.filters.dateRange"),
        value: t(`admin.reports.range.upcoming.${currentPreset}`),
        onRemove: () => {
          const range = buildPresetRange(DEFAULT_PRESET);
          setFilter("from", range.from);
          setFilter("to", range.to);
        },
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
    const groupId =
      typeof state.filters.groupId === "string" ? state.filters.groupId : "";
    if (groupId) {
      chips.push({
        key: "groupId",
        label: t("admin.reports.filters.groupClass"),
        value: groups.find((option) => option.id === groupId)?.name ?? groupId,
        onRemove: () => setFilter("groupId", ""),
      });
    }
    const centerId =
      typeof state.filters.centerId === "string" ? state.filters.centerId : "";
    if (centerId) {
      chips.push({
        key: "centerId",
        label: t("admin.reports.filters.center"),
        value: centers.find((option) => option.id === centerId)?.name ?? centerId,
        onRemove: () => setFilter("centerId", ""),
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
    centers,
    currentPreset,
    groups,
    setFilter,
    setSearch,
    state.filters.centerId,
    state.filters.groupId,
    state.filters.tutorId,
    state.search,
    t,
    tutors,
  ]);

  const columns = useMemo<AdminDataTableColumn<UpcomingSessionRow>[]>(
    () => [
      {
        key: "startAt",
        sortField: "startAt",
        label: t("admin.reports.upcoming.columns.sessionDate"),
        sortable: true,
        renderCell: (row) => formatDateTime(row.startAt, locale),
      },
      {
        key: "startTime",
        label: t("admin.reports.upcoming.columns.startTime"),
        renderCell: (row) => formatDateTime(row.startAt, locale),
      },
      {
        key: "duration",
        label: t("admin.reports.upcoming.columns.duration"),
        renderCell: (row) => formatDurationMinutes(row.startAt, row.endAt),
      },
      {
        key: "sessionType",
        label: t("admin.reports.upcoming.columns.sessionType"),
        renderCell: (row) => t(getSessionTypeKey(row.sessionType)),
      },
      {
        key: "groupName",
        label: t("admin.reports.upcoming.columns.groupClass"),
        renderCell: (row) => row.groupName ?? t("generic.dash"),
      },
      {
        key: "tutorName",
        sortField: "tutorName",
        label: t("admin.reports.upcoming.columns.tutor"),
        sortable: true,
        renderCell: (row) => row.tutorName,
      },
      {
        key: "centerName",
        sortField: "centerName",
        label: t("admin.reports.upcoming.columns.center"),
        sortable: true,
        renderCell: (row) => row.centerName,
      },
      {
        key: "rosterCount",
        label: t("admin.reports.upcoming.columns.students"),
        renderCell: (row) => row.rosterCount,
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.reports.upcoming.empty.title"),
      body: t("admin.reports.upcoming.empty.body"),
      ctaLabel: t("admin.reports.upcoming.empty.cta"),
      onCta: clearAll,
    }),
    [clearAll, t],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="report-upcoming-sessions">
      <AdminTableToolbar
        searchId="upcoming-sessions-search"
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
          <AdminDataTable<UpcomingSessionRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `report-upcoming-${row.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) =>
              setSort(field, dir ?? "asc")
            }
            testId="report-upcoming-sessions-table"
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
        <AdminFormField label={t("admin.reports.filters.dateRange")} htmlFor="upcoming-preset">
          <select
            id="upcoming-preset"
            className={inputBase}
            value={currentPreset ?? DEFAULT_PRESET}
            onChange={(event) => {
              const preset = event.target.value as UpcomingPreset;
              const range = buildPresetRange(preset);
              setFilter("from", range.from);
              setFilter("to", range.to);
            }}
          >
            <option value="today">{t("admin.reports.range.upcoming.today")}</option>
            <option value="7d">{t("admin.reports.range.upcoming.7d")}</option>
            <option value="14d">{t("admin.reports.range.upcoming.14d")}</option>
            <option value="30d">{t("admin.reports.range.upcoming.30d")}</option>
          </select>
        </AdminFormField>
        <AdminFormField label={t("admin.reports.filters.tutor")} htmlFor="upcoming-tutor">
          <select
            id="upcoming-tutor"
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
        <AdminFormField label={t("admin.reports.filters.groupClass")} htmlFor="upcoming-group">
          <select
            id="upcoming-group"
            className={inputBase}
            value={typeof state.filters.groupId === "string" ? state.filters.groupId : ""}
            onChange={(event) => setFilter("groupId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allGroups")}</option>
            {groups.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField label={t("admin.reports.filters.center")} htmlFor="upcoming-center">
          <select
            id="upcoming-center"
            className={inputBase}
            value={typeof state.filters.centerId === "string" ? state.filters.centerId : ""}
            onChange={(event) => setFilter("centerId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allCenters")}</option>
            {centers.map((option) => (
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
