// Missing-resources report client reuses admin table URL query state and server-side pagination.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { SessionType } from "@/generated/prisma/client";
import type {
  AdminReportCenterOption,
  AdminReportTutorOption,
} from "@/lib/reports/adminReportOptions";
import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminPagination from "@/components/admin/shared/AdminPagination";
import AdminTableToolbar, {
  type AdminFilterChip,
} from "@/components/admin/shared/AdminTableToolbar";
import {
  AdminErrorPanel,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";
import { inputBase } from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";

type MissingResourcesReportClientProps = {
  tenant: string;
  tutors: AdminReportTutorOption[];
  centers: AdminReportCenterOption[];
};

type MissingResourcesRow = {
  sessionId: string;
  startDateTime: string;
  endDateTime: string;
  contextLabel: string | null;
  tutorName: string;
  centerName: string;
  sessionType: SessionType;
  hasResources: boolean;
  resourceCount: number;
};

type MissingResourcesResponse = {
  rows: MissingResourcesRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: {
    field: string;
    dir: "asc" | "desc";
  };
  appliedFilters: Record<string, unknown>;
};

function dateToYyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildDefaultRange() {
  const today = new Date();
  const dayStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  return {
    from: dateToYyyyMmDd(dayStart),
    to: dateToYyyyMmDd(addDays(dayStart, 13)),
  };
}

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getSessionTypeKey(type: SessionType) {
  if (type === "ONE_ON_ONE") return "admin.sessions.types.oneOnOne";
  if (type === "GROUP") return "admin.sessions.types.group";
  return "admin.sessions.types.class";
}

export default function MissingResourcesReportClient({
  tenant,
  tutors,
  centers,
}: MissingResourcesReportClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [rows, setRows] = useState<MissingResourcesRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "startAt",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["from", "to", "centerId", "tutorId", "sessionType"],
    });

  // Default date range keeps the report focused on upcoming sessions unless the user changes it.
  useEffect(() => {
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    if (from && to) return;
    const range = buildDefaultRange();
    setFilter("from", range.from);
    setFilter("to", range.to);
  }, [setFilter, state.filters.from, state.filters.to]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = buildAdminTableParams(state);
    const url = buildTenantApiUrl(
      tenant,
      `/admin/reports/sessions-missing-resources?${params.toString()}`,
    );
    const result = await fetchJson<MissingResourcesResponse>(url, {
      cache: "no-store",
    });

    if (!result.ok) {
      setRows([]);
      setTotalCount(0);
      setError(t("missingResourcesReport.error.body"));
      setIsLoading(false);
      return;
    }

    setRows(result.data.rows ?? []);
    setTotalCount(result.data.totalCount ?? 0);
    setIsLoading(false);
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRows, reloadNonce]);

  const exportCsv = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);
    try {
      const params = buildAdminTableParams(state, { includePaging: false });
      const url = buildTenantApiUrl(
        tenant,
        `/admin/reports/sessions-missing-resources.csv?${params.toString()}`,
      );
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        setExportError(t("missingResourcesReport.export.toast.error.body"));
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "sessions-missing-resources.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      setExportSuccess(t("missingResourcesReport.export.toast.success.body"));
    } catch {
      setExportError(t("missingResourcesReport.export.toast.error.body"));
    } finally {
      setIsExporting(false);
    }
  }, [state, t, tenant]);

  const clearAll = useCallback(() => {
    clearFilters();
    const range = buildDefaultRange();
    setFilter("from", range.from);
    setFilter("to", range.to);
    setSearch("");
    setSearchInput("");
  }, [clearFilters, setFilter, setSearch]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    const centerId =
      typeof state.filters.centerId === "string" ? state.filters.centerId : "";
    const tutorId =
      typeof state.filters.tutorId === "string" ? state.filters.tutorId : "";
    const sessionType =
      typeof state.filters.sessionType === "string"
        ? state.filters.sessionType
        : "";

    if (from || to) {
      chips.push({
        key: "dateRange",
        label: t("missingResourcesReport.filters.dateRange"),
        value: `${from || t("generic.dash")} - ${to || t("generic.dash")}`,
        onRemove: () => {
          const range = buildDefaultRange();
          setFilter("from", range.from);
          setFilter("to", range.to);
        },
      });
    }
    if (centerId) {
      chips.push({
        key: "centerId",
        label: t("missingResourcesReport.filters.center"),
        value: centers.find((option) => option.id === centerId)?.name ?? centerId,
        onRemove: () => setFilter("centerId", ""),
      });
    }
    if (tutorId) {
      chips.push({
        key: "tutorId",
        label: t("missingResourcesReport.filters.tutor"),
        value: tutors.find((option) => option.id === tutorId)?.name ?? tutorId,
        onRemove: () => setFilter("tutorId", ""),
      });
    }
    if (sessionType) {
      chips.push({
        key: "sessionType",
        label: t("missingResourcesReport.filters.sessionType"),
        value: t(getSessionTypeKey(sessionType as SessionType)),
        onRemove: () => setFilter("sessionType", ""),
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
  }, [centers, setFilter, setSearch, state.filters, state.search, t, tutors]);

  const columns = useMemo<AdminDataTableColumn<MissingResourcesRow>[]>(
    () => [
      {
        key: "startDateTime",
        sortField: "startAt",
        label: t("missingResourcesReport.table.sessionDateTime"),
        sortable: true,
        renderCell: (row) => formatDateTime(row.startDateTime, locale),
      },
      {
        key: "context",
        sortField: "context",
        label: t("missingResourcesReport.table.context"),
        sortable: true,
        renderCell: (row) => (
          <span className="text-sm text-slate-800">
            {row.contextLabel ?? t(getSessionTypeKey(row.sessionType))}
          </span>
        ),
      },
      {
        key: "tutorName",
        sortField: "tutorName",
        label: t("missingResourcesReport.table.tutor"),
        sortable: true,
        renderCell: (row) => row.tutorName,
      },
      {
        key: "hasResources",
        label: t("missingResourcesReport.table.hasResources"),
        renderCell: (row) =>
          row.hasResources
            ? t("missingResourcesReport.value.yes")
            : t("missingResourcesReport.value.no"),
      },
      {
        key: "resourceCount",
        label: t("missingResourcesReport.table.count"),
        renderCell: (row) => row.resourceCount,
      },
    ],
    [locale, t],
  );

  const emptyState = useMemo<AdminEmptyState>(
    () => ({
      title: t("missingResourcesReport.empty.title"),
      body: t("missingResourcesReport.empty.body"),
      ctaLabel: t("admin.table.filters.clearAll"),
      onCta: clearAll,
    }),
    [clearAll, t],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="report-missing-resources">
      <AdminTableToolbar
        searchId="missing-resources-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        showExportButton
        onExportCsv={() => void exportCsv()}
        isExporting={isExporting}
        exportDisabled={isLoading || rows.length === 0}
        exportLabel={t("missingResourcesReport.export.csv")}
        exportingLabel={t("missingResourcesReport.export.exporting")}
      />

      {error ? <AdminErrorPanel onRetry={() => setReloadNonce((current) => current + 1)} /> : null}
      {exportSuccess ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {exportSuccess}
        </p>
      ) : null}
      {exportError ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </p>
      ) : null}

      {!error ? (
        <>
          <AdminDataTable<MissingResourcesRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `missing-resources-row-${row.sessionId}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            testId="report-missing-resources-table"
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
        <AdminFormField
          label={t("missingResourcesReport.filters.dateRange")}
          htmlFor="missing-resources-from"
        >
          <input
            id="missing-resources-from"
            className={inputBase}
            type="date"
            value={typeof state.filters.from === "string" ? state.filters.from : ""}
            onChange={(event) => setFilter("from", event.target.value)}
          />
        </AdminFormField>
        <AdminFormField
          label={t("missingResourcesReport.filters.dateRange")}
          htmlFor="missing-resources-to"
        >
          <input
            id="missing-resources-to"
            className={inputBase}
            type="date"
            value={typeof state.filters.to === "string" ? state.filters.to : ""}
            onChange={(event) => setFilter("to", event.target.value)}
          />
        </AdminFormField>
        <AdminFormField
          label={t("missingResourcesReport.filters.center")}
          htmlFor="missing-resources-center"
        >
          <select
            id="missing-resources-center"
            className={inputBase}
            value={typeof state.filters.centerId === "string" ? state.filters.centerId : ""}
            onChange={(event) => setFilter("centerId", event.target.value)}
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
          label={t("missingResourcesReport.filters.tutor")}
          htmlFor="missing-resources-tutor"
        >
          <select
            id="missing-resources-tutor"
            className={inputBase}
            value={typeof state.filters.tutorId === "string" ? state.filters.tutorId : ""}
            onChange={(event) => setFilter("tutorId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allTutors")}</option>
            {tutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id}>
                {tutor.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("missingResourcesReport.filters.sessionType")}
          htmlFor="missing-resources-session-type"
        >
          <select
            id="missing-resources-session-type"
            className={inputBase}
            value={typeof state.filters.sessionType === "string" ? state.filters.sessionType : ""}
            onChange={(event) => setFilter("sessionType", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allSessionTypes")}</option>
            <option value="ONE_ON_ONE">{t("admin.sessions.types.oneOnOne")}</option>
            <option value="GROUP">{t("admin.sessions.types.group")}</option>
            <option value="CLASS">{t("admin.sessions.types.class")}</option>
          </select>
        </AdminFormField>
      </AdminFiltersSheet>
    </div>
  );
}
