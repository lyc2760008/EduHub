// Admin announcement engagement report uses shared table query state and exports CSV with the same active filters.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

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

type EngagementRow = {
  announcementId: string;
  title: string;
  publishedAt: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  totalReads: number;
  readsByRole: {
    parent: number;
    tutor: number;
    admin: number;
  };
  eligibleCount: number | null;
  readRate: number | null;
};

type EngagementResponse = {
  items: EngagementRow[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  sort: {
    field: string;
    dir: "asc" | "desc";
  };
  appliedFilters: Record<string, unknown>;
};

type ExportToastTone = "success" | "error";

type ExportToast = {
  tone: ExportToastTone;
  title: string;
  body: string;
};

type AdminAnnouncementsEngagementClientProps = {
  tenant: string;
};

function formatDateTime(value: string | null, locale: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatRate(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return `${value.toFixed(2)}%`;
}

function getStatusKey(status: EngagementRow["status"]) {
  if (status === "ARCHIVED") return "adminAnnouncements.status.archived";
  if (status === "PUBLISHED") return "adminAnnouncements.status.published";
  return "adminAnnouncements.status.draft";
}

export default function AdminAnnouncementsEngagementClient({
  tenant,
}: AdminAnnouncementsEngagementClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState<ExportToast | null>(null);

  const {
    state,
    setSearch,
    setFilter,
    setFilters,
    clearFilters,
    setSort,
    setPage,
    setPageSize,
  } = useAdminTableQueryState({
    defaultSortField: "publishedAt",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    maxPageSize: 100,
    allowedPageSizes: [25, 50, 100],
    allowedFilterKeys: ["status", "from", "to"],
  });

  // Engagement defaults to published announcements so draft rows stay excluded unless explicitly requested.
  useEffect(() => {
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    if (!status) {
      setFilter("status", "PUBLISHED");
    }
  }, [setFilter, state.filters.status]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);
  useEffect(() => {
    setSearchInput(state.search);
  }, [state.search]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    const params = buildAdminTableParams(state);
    const result = await fetchJson<EngagementResponse>(
      buildTenantApiUrl(tenant, `/admin/announcements/engagement?${params.toString()}`),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setRows([]);
      setTotalCount(0);
      setListError(t("announcementsReport.error.body"));
      setIsLoading(false);
      return;
    }

    setRows(result.data.items ?? []);
    setTotalCount(result.data.pageInfo?.totalCount ?? 0);
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
    setExportToast(null);

    try {
      const params = buildAdminTableParams(state, { includePaging: false });
      const query = params.toString();
      const response = await fetch(
        buildTenantApiUrl(
          tenant,
          `/admin/announcements/engagement.csv${query ? `?${query}` : ""}`,
        ),
      );

      if (!response.ok) {
        setExportToast({
          tone: "error",
          title: t("announcementsReport.export.toast.error.title"),
          body: t("announcementsReport.export.toast.error.body"),
        });
        setIsExporting(false);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "announcements-engagement.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportToast({
        tone: "success",
        title: t("announcementsReport.export.toast.success.title"),
        body: t("announcementsReport.export.toast.success.body"),
      });
    } catch {
      setExportToast({
        tone: "error",
        title: t("announcementsReport.export.toast.error.title"),
        body: t("announcementsReport.export.toast.error.body"),
      });
    } finally {
      setIsExporting(false);
    }
  }, [state, t, tenant]);

  const clearAll = useCallback(() => {
    setExportToast(null);
    setSearchInput("");
    clearFilters();
    setSearch("");
    setFilters({ status: "PUBLISHED" });
  }, [clearFilters, setFilters, setSearch]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";

    if (state.search.trim()) {
      chips.push({
        key: "search",
        label: t("admin.table.search.label"),
        value: state.search.trim(),
        onRemove: () => setSearch(""),
      });
    }

    if (status) {
      chips.push({
        key: "status",
        label: t("announcementsReport.filters.status"),
        value:
          status === "ALL"
            ? t("admin.reports.statusFilter.all")
            : t(getStatusKey(status as EngagementRow["status"])),
        onRemove: () => setFilter("status", "PUBLISHED"),
      });
    }

    if (from || to) {
      chips.push({
        key: "dateRange",
        label: t("announcementsReport.filters.dateRange"),
        value: `${from || t("generic.dash")} -> ${to || t("generic.dash")}`,
        onRemove: () => {
          const next = { ...state.filters };
          delete next.from;
          delete next.to;
          setFilters(next);
        },
      });
    }

    return chips;
  }, [setFilter, setFilters, setSearch, state.filters, state.search, t]);

  const columns = useMemo<AdminDataTableColumn<EngagementRow>[]>(
    () => [
      {
        key: "announcement",
        label: t("announcementsReport.table.announcement"),
        sortable: true,
        sortField: "title",
        renderCell: (row) => (
          <Link
            href={`/${tenant}/admin/announcements/${row.announcementId}`}
            className="line-clamp-2 text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-2"
          >
            {row.title}
          </Link>
        ),
      },
      {
        key: "publishedAt",
        label: t("announcementsReport.table.publishedAt"),
        sortable: true,
        sortField: "publishedAt",
        renderCell: (row) => (
          <span>{formatDateTime(row.publishedAt, locale) ?? t("generic.dash")}</span>
        ),
      },
      {
        key: "audienceSize",
        label: t("announcementsReport.table.audienceSize"),
        renderCell: (row) => (
          <span>
            {row.eligibleCount === null
              ? t("announcementsReport.value.na")
              : row.eligibleCount}
          </span>
        ),
      },
      {
        key: "readCount",
        label: t("announcementsReport.table.readCount"),
        renderCell: (row) => <span>{row.totalReads}</span>,
      },
      {
        key: "readRate",
        label: t("announcementsReport.table.readRate"),
        renderCell: (row) => (
          <span>
            {formatRate(row.readRate) ?? t("announcementsReport.value.dash")}
          </span>
        ),
      },
    ],
    [locale, t, tenant],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("announcementsReport.empty.title"),
      body: t("announcementsReport.empty.body"),
    }),
    [t],
  );

  const statusValue =
    typeof state.filters.status === "string" ? state.filters.status : "PUBLISHED";
  const fromValue = typeof state.filters.from === "string" ? state.filters.from : "";
  const toValue = typeof state.filters.to === "string" ? state.filters.to : "";

  return (
    <div className="flex flex-col gap-4" data-testid="announcements-engagement-report">
      <AdminTableToolbar
        searchId="announcements-engagement-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        searchPlaceholder={t("adminAnnouncements.search.placeholder")}
        showExportButton
        onExportCsv={() => void exportCsv()}
        isExporting={isExporting}
        exportDisabled={isLoading || Boolean(listError) || totalCount === 0}
        exportLabel={t("announcementsReport.export.csv")}
        exportingLabel={t("announcementsReport.export.exporting")}
        exportHint={null}
      />

      {exportToast ? (
        <section
          className={`rounded border px-3 py-2 ${
            exportToast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          data-testid="announcements-engagement-export-toast"
        >
          <p className="text-sm font-semibold">{exportToast.title}</p>
          <p className="text-xs">{exportToast.body}</p>
        </section>
      ) : null}

      {listError ? (
        <AdminErrorPanel
          title={t("announcementsReport.error.title")}
          body={listError}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      ) : (
        <>
          <AdminDataTable<EngagementRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `announcement-engagement-${row.announcementId}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            testId="announcements-engagement-table"
          />
          <AdminPagination
            page={state.page}
            pageSize={state.pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      <AdminFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        onReset={clearAll}
      >
        <AdminFormField
          label={t("announcementsReport.filters.status")}
          htmlFor="engagement-filter-status"
        >
          <select
            id="engagement-filter-status"
            className={inputBase}
            value={statusValue}
            onChange={(event) => setFilter("status", event.target.value)}
            data-testid="engagement-filter-status"
          >
            <option value="PUBLISHED">{t("adminAnnouncements.status.published")}</option>
            <option value="ARCHIVED">{t("adminAnnouncements.status.archived")}</option>
            <option value="ALL">{t("admin.reports.statusFilter.all")}</option>
          </select>
        </AdminFormField>

        <AdminFormField
          label={t("adminAnnouncements.filters.startDate")}
          htmlFor="engagement-filter-from"
        >
          <input
            id="engagement-filter-from"
            type="date"
            className={inputBase}
            value={fromValue}
            onChange={(event) => setFilter("from", event.target.value || null)}
            data-testid="engagement-filter-from"
          />
        </AdminFormField>

        <AdminFormField
          label={t("adminAnnouncements.filters.endDate")}
          htmlFor="engagement-filter-to"
        >
          <input
            id="engagement-filter-to"
            type="date"
            className={inputBase}
            value={toValue}
            onChange={(event) => setFilter("to", event.target.value || null)}
            data-testid="engagement-filter-to"
          />
        </AdminFormField>
      </AdminFiltersSheet>
    </div>
  );
}
