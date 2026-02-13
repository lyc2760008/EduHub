// Admin announcements list client uses shared table/query-state patterns with server-driven filters, sorting, and pagination.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";

type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type AnnouncementListItem = {
  id: string;
  title: string;
  status: AnnouncementStatus;
  scope: "TENANT_WIDE";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  authorName: string | null;
  totalReads: number;
};

type AnnouncementListResponse = {
  items: AnnouncementListItem[];
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

type MutationType = "publish" | "archive";

type ConfirmState = {
  type: MutationType;
  item: AnnouncementListItem;
};

type AdminAnnouncementsListClientProps = {
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

function getStatusLabelKey(status: AnnouncementStatus) {
  if (status === "PUBLISHED") return "adminAnnouncements.status.published";
  if (status === "ARCHIVED") return "adminAnnouncements.status.archived";
  return "adminAnnouncements.status.draft";
}

export default function AdminAnnouncementsListClient({
  tenant,
}: AdminAnnouncementsListClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const {
    state,
    setSearch,
    setFilter,
    setFilters,
    setSort,
    setPage,
    setPageSize,
    resetAll,
  } = useAdminTableQueryState({
    defaultSortField: "createdAt",
    defaultSortDir: "desc",
    defaultPageSize: 25,
    maxPageSize: 100,
    allowedPageSizes: [25, 50, 100],
    allowedFilterKeys: ["status", "from", "to", "author"],
  });

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = buildAdminTableParams(state);
    const url = buildTenantApiUrl(
      tenant,
      `/admin/announcements?${params.toString()}`,
    );
    const result = await fetchJson<AnnouncementListResponse>(url, {
      cache: "no-store",
    });

    if (!result.ok) {
      setError(t("adminAnnouncements.error.body"));
      setItems([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    setItems(result.data.items ?? []);
    setTotalCount(result.data.pageInfo?.totalCount ?? 0);
    setIsLoading(false);
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadItems();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadItems, reloadNonce]);

  const performMutation = useCallback(
    async (mutation: MutationType, announcement: AnnouncementListItem) => {
      setIsSubmittingAction(true);
      const endpoint =
        mutation === "publish"
          ? `/admin/announcements/${announcement.id}/publish`
          : `/admin/announcements/${announcement.id}/archive`;
      const result = await fetchJson<{ item: AnnouncementListItem }>(
        buildTenantApiUrl(tenant, endpoint),
        {
          method: "POST",
        },
      );
      setIsSubmittingAction(false);
      setConfirmState(null);

      if (!result.ok) {
        setActionMessage(t("adminAnnouncements.toast.error"));
        return;
      }

      setActionMessage(
        mutation === "publish"
          ? t("adminAnnouncements.toast.published")
          : t("adminAnnouncements.toast.archived"),
      );
      setReloadNonce((value) => value + 1);
    },
    [t, tenant],
  );

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const status = typeof state.filters.status === "string" ? state.filters.status : "";
    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    const author = typeof state.filters.author === "string" ? state.filters.author : "";

    if (state.search.trim()) {
      chips.push({
        key: "search",
        label: t("admin.table.search.label"),
        value: state.search.trim(),
        onRemove: () => {
          setSearch("");
          setSearchInput("");
        },
      });
    }

    if (status) {
      chips.push({
        key: "status",
        label: t("adminAnnouncements.filters.status"),
        value: t(getStatusLabelKey(status as AnnouncementStatus)),
        onRemove: () => setFilter("status", null),
      });
    }

    if (from || to) {
      chips.push({
        key: "dateRange",
        label: t("adminAnnouncements.filters.dateRange"),
        value: `${from || t("generic.dash")} -> ${to || t("generic.dash")}`,
        onRemove: () => {
          const nextFilters = { ...state.filters };
          delete nextFilters.from;
          delete nextFilters.to;
          setFilters(nextFilters);
        },
      });
    }

    if (author.trim()) {
      chips.push({
        key: "author",
        label: t("adminAnnouncements.filters.author"),
        value: author.trim(),
        onRemove: () => setFilter("author", null),
      });
    }

    return chips;
  }, [setFilter, setFilters, setSearch, state.filters, state.search, t]);

  const columns = useMemo<AdminDataTableColumn<AnnouncementListItem>[]>(
    () => [
      {
        key: "createdAt",
        label: t("adminAnnouncements.table.createdAt"),
        sortable: true,
        sortField: "createdAt",
        renderCell: (row) => (
          <span>{formatDateTime(row.createdAt, locale) ?? t("generic.dash")}</span>
        ),
      },
      {
        key: "title",
        label: t("adminAnnouncements.table.title"),
        renderCell: (row) => (
          <span className="line-clamp-2 text-sm font-medium text-slate-900">
            {row.title}
          </span>
        ),
      },
      {
        key: "scope",
        label: t("adminAnnouncements.table.scope"),
        renderCell: () => (
          <span>{t("adminAnnouncements.scope.tenantWide")}</span>
        ),
      },
      {
        key: "status",
        label: t("adminAnnouncements.table.status"),
        sortable: true,
        sortField: "status",
        renderCell: (row) => (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
              row.status === "PUBLISHED"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : row.status === "ARCHIVED"
                  ? "border-slate-300 bg-slate-100 text-slate-700"
                  : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {t(getStatusLabelKey(row.status))}
          </span>
        ),
      },
      {
        key: "publishedAt",
        label: t("adminAnnouncements.table.publishedAt"),
        sortable: true,
        sortField: "publishedAt",
        renderCell: (row) => (
          <span>{formatDateTime(row.publishedAt, locale) ?? t("generic.dash")}</span>
        ),
      },
      {
        key: "author",
        label: t("adminAnnouncements.table.author"),
        renderCell: (row) => (
          <span>{row.authorName?.trim() || t("adminAnnouncements.author.system")}</span>
        ),
      },
      {
        key: "actions",
        label: t("adminAnnouncements.table.actions"),
        renderCell: (row) => (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${tenant}/admin/announcements/${row.id}`}
              className={`${secondaryButton} px-3 py-1 text-xs`}
              onClick={(event) => event.stopPropagation()}
            >
              {t("adminAnnouncements.action.edit")}
            </Link>
            {row.status === "DRAFT" ? (
              <button
                type="button"
                className={`${secondaryButton} px-3 py-1 text-xs`}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmState({ type: "publish", item: row });
                }}
              >
                {t("adminAnnouncements.action.publish")}
              </button>
            ) : null}
            {row.status !== "ARCHIVED" ? (
              <button
                type="button"
                className={`${secondaryButton} px-3 py-1 text-xs`}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmState({ type: "archive", item: row });
                }}
              >
                {t("adminAnnouncements.action.archive")}
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [locale, t, tenant],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("adminAnnouncements.empty.title"),
      body: t("adminAnnouncements.empty.body"),
    }),
    [t],
  );

  const clearAll = useCallback(() => {
    setActionMessage(null);
    setSearchInput("");
    resetAll({
      search: "",
      sortField: "createdAt",
      sortDir: "desc",
      filters: {},
    });
  }, [resetAll]);

  return (
    <div className="flex flex-col gap-6" data-testid="admin-announcements-list">
      <AdminTableToolbar
        searchId="announcements-list-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        searchPlaceholder={t("adminAnnouncements.search.placeholder")}
        rightSlot={(
          <Link
            href={`/${tenant}/admin/announcements/new`}
            className={primaryButton}
          >
            {t("adminAnnouncements.create")}
          </Link>
        )}
      />

      {actionMessage ? (
        <section
          className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          data-testid="admin-announcements-message"
        >
          {actionMessage}
        </section>
      ) : null}

      {error ? (
        <AdminErrorPanel
          title={t("adminAnnouncements.error.title")}
          body={error}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      ) : (
        <>
          <AdminDataTable<AnnouncementListItem>
            columns={columns}
            rows={items}
            rowKey={(row) => `announcement-row-${row.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={(row) => router.push(`/${tenant}/admin/announcements/${row.id}`)}
            testId="admin-announcements-table"
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
          label={t("adminAnnouncements.filters.status")}
          htmlFor="announcement-filter-status"
        >
          <select
            id="announcement-filter-status"
            className={inputBase}
            value={typeof state.filters.status === "string" ? state.filters.status : ""}
            onChange={(event) =>
              setFilter("status", event.target.value || null)
            }
            data-testid="announcement-filter-status"
          >
            <option value="">{t("adminAnnouncements.filters.statusAll")}</option>
            <option value="DRAFT">{t("adminAnnouncements.status.draft")}</option>
            <option value="PUBLISHED">
              {t("adminAnnouncements.status.published")}
            </option>
            <option value="ARCHIVED">{t("adminAnnouncements.status.archived")}</option>
          </select>
        </AdminFormField>

        <AdminFormField
          label={t("adminAnnouncements.filters.startDate")}
          htmlFor="announcement-filter-from"
        >
          <input
            id="announcement-filter-from"
            type="date"
            className={inputBase}
            value={typeof state.filters.from === "string" ? state.filters.from : ""}
            onChange={(event) => setFilter("from", event.target.value || null)}
            data-testid="announcement-filter-from"
          />
        </AdminFormField>

        <AdminFormField
          label={t("adminAnnouncements.filters.endDate")}
          htmlFor="announcement-filter-to"
        >
          <input
            id="announcement-filter-to"
            type="date"
            className={inputBase}
            value={typeof state.filters.to === "string" ? state.filters.to : ""}
            onChange={(event) => setFilter("to", event.target.value || null)}
            data-testid="announcement-filter-to"
          />
        </AdminFormField>

        <AdminFormField
          label={t("adminAnnouncements.filters.author")}
          htmlFor="announcement-filter-author"
        >
          <input
            id="announcement-filter-author"
            className={inputBase}
            value={typeof state.filters.author === "string" ? state.filters.author : ""}
            onChange={(event) => setFilter("author", event.target.value || null)}
            placeholder={t("adminAnnouncements.filters.authorPlaceholder")}
            data-testid="announcement-filter-author"
          />
        </AdminFormField>
      </AdminFiltersSheet>

      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {confirmState.type === "publish"
                ? t("adminAnnouncements.confirm.publish.title")
                : t("adminAnnouncements.confirm.archive.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {confirmState.type === "publish"
                ? t("adminAnnouncements.confirm.publish.body")
                : t("adminAnnouncements.confirm.archive.body")}
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setConfirmState(null)}
                disabled={isSubmittingAction}
              >
                {t("adminAnnouncements.confirm.ctaCancel")}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() =>
                  void performMutation(confirmState.type, confirmState.item)
                }
                disabled={isSubmittingAction}
              >
                {isSubmittingAction
                  ? t("adminAnnouncements.action.saving")
                  : t("adminAnnouncements.confirm.ctaConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
