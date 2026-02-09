// Admin requests inbox uses shared table toolkit while preserving existing resolve drawer behavior.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

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
import { inputBase, primaryButton, secondaryButton } from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import { getSessionTypeLabelKey } from "@/lib/portal/format";
import { useAdminTableQueryState, useDebouncedValue } from "@/lib/admin-table/useAdminTableQueryState";

type RequestStatus = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

type RequestParent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type RequestStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type RequestSession = {
  id: string;
  startAt: string;
  endAt: string;
  sessionType: string;
  group?: { name: string | null } | null;
};

type RequestRecord = {
  id: string;
  type: string;
  status: RequestStatus;
  reasonCode: string;
  message?: string | null;
  sessionId: string;
  studentId: string;
  parentId: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  withdrawnAt?: string | null;
  resubmittedAt?: string | null;
  parent: RequestParent;
  student: RequestStudent;
  session: RequestSession;
};

type RequestsResponse = {
  rows: RequestRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

const STATUS_OPTIONS: Array<{ value: RequestStatus | "ALL"; labelKey: string }> = [
  { value: "PENDING", labelKey: "admin.requests.status.pending" },
  { value: "APPROVED", labelKey: "admin.requests.status.approved" },
  { value: "DECLINED", labelKey: "admin.requests.status.declined" },
  { value: "WITHDRAWN", labelKey: "admin.requests.status.withdrawn" },
  { value: "ALL", labelKey: "admin.requests.status.all" },
];

const ABSENCE_REASON_LABELS: Record<string, string> = {
  ILLNESS: "portal.absence.reason.illness",
  TRAVEL: "portal.absence.reason.travel",
  FAMILY: "portal.absence.reason.family",
  SCHOOL_CONFLICT: "portal.absence.reason.schoolConflict",
  OTHER: "portal.absence.reason.other",
};

function getRequestStatusLabelKey(status: RequestStatus) {
  if (status === "PENDING") return "admin.requests.status.pending";
  if (status === "APPROVED") return "admin.requests.status.approved";
  if (status === "DECLINED") return "admin.requests.status.declined";
  return "admin.requests.status.withdrawn";
}

function getRequestStatusTone(status: RequestStatus) {
  if (status === "APPROVED") return "border-green-600 text-green-700";
  if (status === "DECLINED") return "border-red-600 text-red-600";
  if (status === "PENDING") return "border-amber-600 text-amber-700";
  return "border-slate-300 text-slate-600";
}

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

type RequestsClientProps = {
  tenant: string;
};

export default function RequestsClient({ tenant }: RequestsClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "createdAt",
      defaultSortDir: "desc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["status"],
    });

  // Pending-first default mirrors the existing operational queue behavior.
  useEffect(() => {
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    if (!status) {
      setFilter("status", "PENDING");
    }
  }, [setFilter, state.filters.status]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Step 21.3 Admin Table query contract keeps request list params consistent.
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "PENDING";
    const params = buildAdminTableParams({
      ...state,
      filters: { ...state.filters, status },
    });
    const url = buildTenantApiUrl(tenant, `/requests?${params.toString()}`);
    const result = await fetchJson<RequestsResponse>(url);

    if (!result.ok) {
      setError(t("common.error"));
      setIsLoading(false);
      return;
    }

    setRequests(result.data.rows ?? []);
    setTotalCount(result.data.totalCount ?? 0);
    setIsLoading(false);
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRequests, reloadNonce]);

  const handleRowClick = useCallback((request: RequestRecord) => {
    setSelected(request);
    setIsDrawerOpen(true);
    setResolveError(null);
    setToast(null);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelected(null);
    setResolveError(null);
  }, []);

  const handleResolve = useCallback(
    async (nextStatus: RequestStatus) => {
      if (!selected) return;
      if (selected.status !== "PENDING") return;

      const confirmKey =
        nextStatus === "APPROVED"
          ? "admin.requests.confirm.approve"
          : "admin.requests.confirm.decline";
      if (!window.confirm(t(confirmKey))) {
        return;
      }

      setIsResolving(true);
      setResolveError(null);

      const result = await fetchJson<{ request: RequestRecord }>(
        buildTenantApiUrl(tenant, `/requests/${selected.id}/resolve`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      if (!result.ok) {
        setResolveError(t("admin.requests.error.body"));
        setIsResolving(false);
        return;
      }

      setIsResolving(false);
      setIsDrawerOpen(false);
      setSelected(null);
      setToast(t("admin.requests.state.resolvedToast"));
      setReloadNonce((current) => current + 1);
    },
    [selected, t, tenant],
  );

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "PENDING";
    if (status !== "PENDING") {
      chips.push({
        key: "status",
        label: t("admin.requests.filter.status"),
        value: t(
          STATUS_OPTIONS.find((option) => option.value === status)?.labelKey ??
            "admin.requests.status.pending",
        ),
        onRemove: () => setFilter("status", "PENDING"),
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
  }, [setFilter, setSearch, state.filters.status, state.search, t]);

  const columns: AdminDataTableColumn<RequestRecord>[] = useMemo(
    () => [
      {
        key: "createdAt",
        label: t("admin.requests.field.submittedAt"),
        sortable: true,
        sortField: "createdAt",
        renderCell: (request) => formatDateTime(request.createdAt, locale) || t("generic.dash"),
      },
      {
        key: "session",
        label: t("admin.requests.field.session"),
        renderCell: (request) => {
          const sessionTypeKey = getSessionTypeLabelKey(request.session.sessionType);
          const sessionTypeLabel = sessionTypeKey ? t(sessionTypeKey) : t("generic.dash");
          return (
            <div className="flex flex-col">
              <span className="font-medium text-slate-900">
                {formatDateTime(request.session.startAt, locale) || t("generic.dash")}
              </span>
              <span className="text-xs text-slate-500">
                {request.session.group?.name?.trim()
                  ? request.session.group.name
                  : sessionTypeLabel}
              </span>
            </div>
          );
        },
      },
      {
        key: "student",
        label: t("admin.requests.field.student"),
        renderCell: (request) => `${request.student.firstName} ${request.student.lastName}`,
      },
      {
        key: "parent",
        label: t("admin.requests.field.parent"),
        renderCell: (request) =>
          `${request.parent.firstName} ${request.parent.lastName} (${request.parent.email})`,
      },
      {
        key: "status",
        label: t("admin.requests.field.status"),
        sortable: true,
        sortField: "status",
        renderCell: (request) => (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${getRequestStatusTone(
              request.status,
            )}`}
          >
            {t(getRequestStatusLabelKey(request.status))}
          </span>
        ),
      },
      {
        key: "updatedAt",
        label: t("admin.requests.field.updatedAt"),
        sortable: true,
        sortField: "updatedAt",
        renderCell: (request) => formatDateTime(request.updatedAt, locale) || t("generic.dash"),
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.requests.empty"),
      body: t("admin.reports.requests.empty.body"),
    }),
    [t],
  );

  const clearAll = () => {
    clearFilters();
    setFilter("status", "PENDING");
    setSearch("");
    setSearchInput("");
  };

  const selectedUpdatedLabel = selected
    ? formatDateTime(
        selected.resubmittedAt ??
          selected.withdrawnAt ??
          selected.updatedAt ??
          selected.resolvedAt ??
          selected.createdAt,
        locale,
      ) || t("generic.dash")
    : "";
  const selectedIsWithdrawn = selected?.status === "WITHDRAWN";

  return (
    <div className="flex flex-col gap-4" data-testid="requests-inbox">
      <AdminTableToolbar
        searchId="requests-list-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
      />

      {error ? <AdminErrorPanel onRetry={() => setReloadNonce((current) => current + 1)} /> : null}
      {toast ? <p className="text-sm text-green-600">{toast}</p> : null}

      {!error ? (
        <>
          <AdminDataTable<RequestRecord>
            columns={columns}
            rows={requests}
            rowKey={(request) => `request-row-${request.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={handleRowClick}
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
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
          {t("admin.requests.filter.status")}
          <select
            className={inputBase}
            value={typeof state.filters.status === "string" ? state.filters.status : "PENDING"}
            onChange={(event) => setFilter("status", event.target.value)}
            data-testid="admin-requests-status-filter"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </AdminFiltersSheet>

      {isDrawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
          role="dialog"
          aria-modal="true"
          data-testid="requests-drawer"
        >
          <div className="h-full w-full max-w-full bg-white p-6 shadow-xl md:w-[420px]">
            {selected ? (
              <div className="flex h-full flex-col gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {t("admin.requests.detail.title")}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {formatDateTime(selected.session.startAt, locale)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {selected.session.group?.name?.trim()
                      ? selected.session.group.name
                      : (() => {
                          const sessionTypeKey = getSessionTypeLabelKey(
                            selected.session.sessionType,
                          );
                          return sessionTypeKey ? t(sessionTypeKey) : t("generic.dash");
                        })()}
                  </p>
                </div>

                {resolveError ? (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-sm font-semibold text-red-700">
                      {t("admin.requests.error.title")}
                    </p>
                    <p className="text-xs text-red-700">
                      {t("admin.requests.error.body")}
                    </p>
                  </div>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("admin.requests.section.request")}
                  </h3>
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.reason")}
                    </span>
                    <span>
                      {t(ABSENCE_REASON_LABELS[selected.reasonCode] ?? "generic.dash")}
                    </span>
                  </div>
                  {selected.message ? (
                    <div className="grid gap-1 text-sm text-slate-700">
                      <span className="text-xs font-semibold text-slate-500">
                        {t("admin.requests.field.message")}
                      </span>
                      <p className="whitespace-pre-line text-sm text-slate-700">
                        {selected.message}
                      </p>
                    </div>
                  ) : null}
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.submittedAt")}
                    </span>
                    <span>{formatDateTime(selected.createdAt, locale)}</span>
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.updatedAt")}
                    </span>
                    <span>{selectedUpdatedLabel}</span>
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.status")}
                    </span>
                    <span>{t(getRequestStatusLabelKey(selected.status))}</span>
                  </div>
                  {selectedIsWithdrawn ? (
                    <p className="text-xs text-slate-600">
                      {t("admin.requests.withdrawn.noAction")}
                    </p>
                  ) : null}
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("admin.requests.section.context")}
                  </h3>
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.student")}
                    </span>
                    <span>
                      {selected.student.firstName} {selected.student.lastName}
                    </span>
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.parent")}
                    </span>
                    <span>
                      {selected.parent.firstName} {selected.parent.lastName} (
                      {selected.parent.email})
                    </span>
                  </div>
                  <div className="grid gap-1 text-sm text-slate-700">
                    <span className="text-xs font-semibold text-slate-500">
                      {t("admin.requests.field.session")}
                    </span>
                    <span>{formatDateTime(selected.session.startAt, locale)}</span>
                  </div>
                </section>

                <div className="mt-auto flex flex-wrap gap-2">
                  {selected.status === "PENDING" ? (
                    <>
                      <button
                        type="button"
                        className={primaryButton}
                        disabled={isResolving}
                        onClick={() => void handleResolve("APPROVED")}
                        data-testid="requests-approve-button"
                      >
                        {t("admin.requests.action.approve")}
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={isResolving}
                        onClick={() => void handleResolve("DECLINED")}
                        data-testid="requests-decline-button"
                      >
                        {t("admin.requests.action.decline")}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={isResolving}
                    onClick={closeDrawer}
                  >
                    {t("common.actions.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {t("common.loading")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
