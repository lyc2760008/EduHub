// Admin notifications report client uses shared admin table URL-state toolkit with aggregate-only rows.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

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

type NotificationsEngagementRow = {
  type: "ANNOUNCEMENT" | "HOMEWORK" | "REQUEST";
  audienceRole: "PARENT" | "TUTOR" | "ADMIN";
  sentCount: number;
  readCount: number;
  readRate: number;
  avgTimeToReadHours: number | null;
};

type NotificationsSummary = {
  totalNotificationsCreated: number;
  totalRecipients: number;
  totalRead: number;
  readRate: number;
};

type NotificationsEngagementResponse = {
  items: NotificationsEngagementRow[];
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
  summary: NotificationsSummary;
};

type ExportToastTone = "success" | "error";
type ExportToast = {
  tone: ExportToastTone;
  title: string;
  body: string;
};

type NotificationsEngagementReportClientProps = {
  tenant: string;
};

function toTypeKey(type: NotificationsEngagementRow["type"]) {
  if (type === "HOMEWORK") return "notifications.type.homework";
  if (type === "REQUEST") return "notifications.type.request";
  return "notifications.type.announcement";
}

function toRoleKey(role: NotificationsEngagementRow["audienceRole"]) {
  if (role === "TUTOR") return "adminNotificationsReport.filters.role.tutor";
  if (role === "ADMIN") return "adminNotificationsReport.filters.role.admin";
  return "adminNotificationsReport.filters.role.parent";
}

function formatRate(value: number) {
  return `${value.toFixed(2)}%`;
}

export default function NotificationsEngagementReportClient({
  tenant,
}: NotificationsEngagementReportClientProps) {
  const t = useTranslations();

  const [rows, setRows] = useState<NotificationsEngagementRow[]>([]);
  const [summary, setSummary] = useState<NotificationsSummary>({
    totalNotificationsCreated: 0,
    totalRecipients: 0,
    totalRead: 0,
    readRate: 0,
  });
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
    defaultSortField: "sentCount",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    maxPageSize: 100,
    allowedPageSizes: [25, 50, 100],
    allowedFilterKeys: ["type", "audienceRole", "readStatus", "from", "to"],
  });

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
    const result = await fetchJson<NotificationsEngagementResponse>(
      buildTenantApiUrl(
        tenant,
        `/admin/reports/notifications-engagement?${params.toString()}`,
      ),
      { cache: "no-store" },
    );

    if (!result.ok) {
      setRows([]);
      setSummary({
        totalNotificationsCreated: 0,
        totalRecipients: 0,
        totalRead: 0,
        readRate: 0,
      });
      setTotalCount(0);
      setListError(t("notifications.error.body"));
      setIsLoading(false);
      return;
    }

    setRows(result.data.items ?? []);
    setSummary(
      result.data.summary ?? {
        totalNotificationsCreated: 0,
        totalRecipients: 0,
        totalRead: 0,
        readRate: 0,
      },
    );
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
          `/admin/reports/notifications-engagement.csv${
            query ? `?${query}` : ""
          }`,
        ),
      );

      if (!response.ok) {
        setExportToast({
          tone: "error",
          title: t("adminNotificationsReport.export.toast.error.title"),
          body: t("adminNotificationsReport.export.toast.error.body"),
        });
        setIsExporting(false);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "notifications-engagement.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportToast({
        tone: "success",
        title: t("adminNotificationsReport.export.toast.success.title"),
        body: t("adminNotificationsReport.export.toast.success.body"),
      });
    } catch {
      setExportToast({
        tone: "error",
        title: t("adminNotificationsReport.export.toast.error.title"),
        body: t("adminNotificationsReport.export.toast.error.body"),
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
  }, [clearFilters, setSearch]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const type = typeof state.filters.type === "string" ? state.filters.type : "";
    const audienceRole =
      typeof state.filters.audienceRole === "string"
        ? state.filters.audienceRole
        : "";
    const readStatus =
      typeof state.filters.readStatus === "string" ? state.filters.readStatus : "";
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
    if (type && type !== "ALL") {
      chips.push({
        key: "type",
        label: t("adminNotificationsReport.filters.type"),
        value: t(
          type === "HOMEWORK"
            ? "notifications.type.homework"
            : type === "REQUEST"
              ? "notifications.type.request"
              : "notifications.type.announcement",
        ),
        onRemove: () => setFilter("type", null),
      });
    }
    if (audienceRole && audienceRole !== "ALL") {
      chips.push({
        key: "audienceRole",
        label: t("adminNotificationsReport.filters.audienceRole"),
        value: t(
          audienceRole === "TUTOR"
            ? "adminNotificationsReport.filters.role.tutor"
            : audienceRole === "ADMIN"
              ? "adminNotificationsReport.filters.role.admin"
              : "adminNotificationsReport.filters.role.parent",
        ),
        onRemove: () => setFilter("audienceRole", null),
      });
    }
    if (readStatus && readStatus !== "ALL") {
      chips.push({
        key: "readStatus",
        label: t("adminNotificationsReport.filters.readStatus"),
        value: t(
          readStatus === "READ"
            ? "adminNotificationsReport.readStatus.read"
            : "adminNotificationsReport.readStatus.unread",
        ),
        onRemove: () => setFilter("readStatus", null),
      });
    }
    if (from || to) {
      chips.push({
        key: "dateRange",
        label: t("adminNotificationsReport.filters.dateRange"),
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

  const columns = useMemo<AdminDataTableColumn<NotificationsEngagementRow>[]>(
    () => [
      {
        key: "type",
        label: t("adminNotificationsReport.table.type"),
        sortable: true,
        sortField: "type",
        renderCell: (row) => <span>{t(toTypeKey(row.type))}</span>,
      },
      {
        key: "audienceRole",
        label: t("adminNotificationsReport.table.audience"),
        sortable: true,
        sortField: "audienceRole",
        renderCell: (row) => <span>{t(toRoleKey(row.audienceRole))}</span>,
      },
      {
        key: "sentCount",
        label: t("adminNotificationsReport.table.sent"),
        sortable: true,
        sortField: "sentCount",
        renderCell: (row) => <span>{row.sentCount}</span>,
      },
      {
        key: "readCount",
        label: t("adminNotificationsReport.table.read"),
        sortable: true,
        sortField: "readCount",
        renderCell: (row) => <span>{row.readCount}</span>,
      },
      {
        key: "readRate",
        label: t("adminNotificationsReport.table.readRate"),
        sortable: true,
        sortField: "readRate",
        renderCell: (row) => <span>{formatRate(row.readRate)}</span>,
      },
      {
        key: "avgTimeToReadHours",
        label: t("adminNotificationsReport.table.avgTimeToRead"),
        renderCell: (row) =>
          row.avgTimeToReadHours === null
            ? t("adminNotificationsReport.value.dash")
            : row.avgTimeToReadHours,
      },
    ],
    [t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("notifications.empty.title"),
      body: t("notifications.empty.body"),
    }),
    [t],
  );

  const typeValue =
    typeof state.filters.type === "string" ? state.filters.type : "ALL";
  const audienceRoleValue =
    typeof state.filters.audienceRole === "string"
      ? state.filters.audienceRole
      : "ALL";
  const readStatusValue =
    typeof state.filters.readStatus === "string"
      ? state.filters.readStatus
      : "ALL";
  const fromValue = typeof state.filters.from === "string" ? state.filters.from : "";
  const toValue = typeof state.filters.to === "string" ? state.filters.to : "";

  return (
    <div className="flex flex-col gap-4" data-testid="notifications-engagement-report">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">
            {t("adminNotificationsReport.summary.totalNotificationsCreated")}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {summary.totalNotificationsCreated}
          </p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">
            {t("adminNotificationsReport.summary.totalRecipients")}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {summary.totalRecipients}
          </p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">
            {t("adminNotificationsReport.summary.totalRead")}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {summary.totalRead}
          </p>
        </article>
        <article className="rounded border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">
            {t("adminNotificationsReport.summary.readRate")}
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {formatRate(summary.readRate)}
          </p>
        </article>
      </section>

      <AdminTableToolbar
        searchId="notifications-engagement-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        searchPlaceholder={t("admin.table.search.placeholder")}
        showExportButton
        onExportCsv={() => void exportCsv()}
        isExporting={isExporting}
        exportDisabled={isLoading || Boolean(listError) || totalCount === 0}
        exportLabel={t("adminNotificationsReport.export.csv")}
        exportingLabel={t("adminNotificationsReport.export.exporting")}
        exportHint={null}
      />

      {exportToast ? (
        <section
          className={`rounded border px-3 py-2 ${
            exportToast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          data-testid="notifications-engagement-export-toast"
        >
          <p className="text-sm font-semibold">{exportToast.title}</p>
          <p className="text-xs">{exportToast.body}</p>
        </section>
      ) : null}

      {listError ? (
        <AdminErrorPanel
          title={t("notifications.error.title")}
          body={listError}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      ) : (
        <>
          <AdminDataTable<NotificationsEngagementRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `notifications-engagement-row-${row.type}-${row.audienceRole}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            testId="notifications-engagement-table"
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
          label={t("adminNotificationsReport.filters.type")}
          htmlFor="notifications-report-filter-type"
        >
          <select
            id="notifications-report-filter-type"
            className={inputBase}
            value={typeValue}
            onChange={(event) => setFilter("type", event.target.value)}
          >
            <option value="ALL">{t("notifications.type.all")}</option>
            <option value="ANNOUNCEMENT">{t("notifications.type.announcement")}</option>
            <option value="HOMEWORK">{t("notifications.type.homework")}</option>
            <option value="REQUEST">{t("notifications.type.request")}</option>
          </select>
        </AdminFormField>

        <AdminFormField
          label={t("adminNotificationsReport.filters.audienceRole")}
          htmlFor="notifications-report-filter-audience-role"
        >
          <select
            id="notifications-report-filter-audience-role"
            className={inputBase}
            value={audienceRoleValue}
            onChange={(event) => setFilter("audienceRole", event.target.value)}
          >
            <option value="ALL">{t("adminNotificationsReport.readStatus.all")}</option>
            <option value="PARENT">{t("adminNotificationsReport.filters.role.parent")}</option>
            <option value="TUTOR">{t("adminNotificationsReport.filters.role.tutor")}</option>
            <option value="ADMIN">{t("adminNotificationsReport.filters.role.admin")}</option>
          </select>
        </AdminFormField>

        <AdminFormField
          label={t("adminNotificationsReport.filters.readStatus")}
          htmlFor="notifications-report-filter-read-status"
        >
          <select
            id="notifications-report-filter-read-status"
            className={inputBase}
            value={readStatusValue}
            onChange={(event) => setFilter("readStatus", event.target.value)}
          >
            <option value="ALL">{t("adminNotificationsReport.readStatus.all")}</option>
            <option value="UNREAD">{t("adminNotificationsReport.readStatus.unread")}</option>
            <option value="READ">{t("adminNotificationsReport.readStatus.read")}</option>
          </select>
        </AdminFormField>

        <AdminFormField
          label={t("adminNotificationsReport.filters.dateRange")}
          htmlFor="notifications-report-filter-from"
        >
          <input
            id="notifications-report-filter-from"
            type="date"
            className={inputBase}
            value={fromValue}
            onChange={(event) => setFilter("from", event.target.value || null)}
          />
        </AdminFormField>
        <AdminFormField
          label={t("adminNotificationsReport.filters.dateRange")}
          htmlFor="notifications-report-filter-to"
        >
          <input
            id="notifications-report-filter-to"
            type="date"
            className={inputBase}
            value={toValue}
            onChange={(event) => setFilter("to", event.target.value || null)}
          />
        </AdminFormField>
      </AdminFiltersSheet>
    </div>
  );
}
