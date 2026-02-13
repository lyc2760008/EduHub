"use client";

// Staff homework queue client powers both admin and tutor queue views with URL-state filters and bulk review actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { AdminErrorPanel } from "@/components/admin/shared/AdminTableStatePanels";
import { inputBase, primaryButton, secondaryButton } from "@/components/admin/shared/adminUiClasses";
import HomeworkStatusBadge from "@/components/homework/HomeworkStatusBadge";
import {
  type HomeworkStatus,
  toHomeworkDisplayStatus,
} from "@/components/homework/homeworkClient";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";
import type {
  AdminReportCenterOption,
  AdminReportTutorOption,
} from "@/lib/reports/adminReportOptions";

type StaffHomeworkMode = "admin" | "tutor";

type StaffHomeworkQueueClientProps = {
  tenant: string;
  mode: StaffHomeworkMode;
  tutors?: AdminReportTutorOption[];
  centers?: AdminReportCenterOption[];
};

type HomeworkQueueRow = {
  homeworkItemId: string;
  sessionId: string;
  studentId: string;
  studentDisplay: string;
  status: HomeworkStatus;
  assignedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  sessionStartAt: string;
  centerId: string | null;
  centerName: string | null;
  tutorId?: string;
  tutorDisplay?: string;
  fileCounts: {
    assignment: number;
    submission: number;
    feedback: number;
  };
};

type HomeworkQueueResponse = {
  rows: HomeworkQueueRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: {
    field: string;
    dir: "asc" | "desc";
  };
  appliedFilters: Record<string, unknown>;
};

type BulkMarkReviewedResponse = {
  ok: boolean;
  reviewedCount: number;
  skippedNotSubmittedCount: number;
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

function getQueueApiBase(mode: StaffHomeworkMode, tenant: string) {
  if (mode === "admin") {
    return buildTenantApiUrl(tenant, "/admin/homework");
  }
  return `/${tenant}/api/tutor/homework`;
}

function getDetailHref(mode: StaffHomeworkMode, tenant: string, id: string) {
  if (mode === "admin") {
    return `/${tenant}/admin/homework/${id}`;
  }
  return `/${tenant}/tutor/homework/${id}`;
}

export default function StaffHomeworkQueueClient({
  tenant,
  mode,
  tutors = [],
  centers = [],
}: StaffHomeworkQueueClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [rows, setRows] = useState<HomeworkQueueRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const hasAppliedInitialStatusDefaultRef = useRef(false);

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
    defaultSortField: "submittedAt",
    defaultSortDir: "asc",
    defaultPageSize: 25,
    maxPageSize: 100,
    allowedPageSizes: [25, 50, 100],
    allowedFilterKeys:
      mode === "admin"
        ? ["status", "from", "to", "tutorId", "centerId"]
        : ["status", "from", "to"],
  });

  // Queue default is SUBMITTED only on first load to focus review-ready items.
  useEffect(() => {
    if (hasAppliedInitialStatusDefaultRef.current) {
      return;
    }
    hasAppliedInitialStatusDefaultRef.current = true;
    if (typeof state.filters.status === "string" && state.filters.status.trim()) {
      return;
    }
    setFilter("status", "SUBMITTED");
  }, [setFilter, state.filters.status]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = buildAdminTableParams(state);
    const query = params.toString();
    const url = `${getQueueApiBase(mode, tenant)}${query ? `?${query}` : ""}`;

    const result = await fetchJson<HomeworkQueueResponse>(url, { cache: "no-store" });
    if (!result.ok) {
      setRows([]);
      setSelectedIds([]);
      setTotalCount(0);
      setError(t("staffHomework.queue.error.body"));
      setIsLoading(false);
      return;
    }

    const nextRows = result.data.rows ?? [];
    setRows(nextRows);
    // Keep selected IDs valid when the server-side page/filter window changes.
    setSelectedIds((current) =>
      current.filter((id) => nextRows.some((row) => row.homeworkItemId === id)),
    );
    setTotalCount(result.data.totalCount ?? 0);
    setIsLoading(false);
  }, [mode, state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRows, reloadNonce]);

  const hasSelection = selectedIds.length > 0;

  const bulkEndpoint =
    mode === "admin"
      ? buildTenantApiUrl(tenant, "/admin/homework/bulk/mark-reviewed")
      : `/${tenant}/api/tutor/homework/bulk/mark-reviewed`;

  const onConfirmBulkMarkReviewed = async () => {
    if (!selectedIds.length) {
      setIsBulkModalOpen(false);
      return;
    }

    setIsSubmittingBulk(true);
    setBannerMessage(null);

    const response = await fetch(bulkEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkItemIds: selectedIds }),
    });

    let payload: BulkMarkReviewedResponse | null = null;
    try {
      payload = (await response.json()) as BulkMarkReviewedResponse;
    } catch {
      payload = null;
    }

    setIsSubmittingBulk(false);
    setIsBulkModalOpen(false);

    if (!response.ok || !payload?.ok) {
      setBannerMessage(t("staffHomework.bulk.toast.error"));
      return;
    }

    if ((payload.skippedNotSubmittedCount ?? 0) > 0) {
      setBannerMessage(
        t("staffHomework.bulk.toast.partial", {
          successCount: payload.reviewedCount,
          skippedCount: payload.skippedNotSubmittedCount,
        }),
      );
    } else {
      setBannerMessage(
        t("staffHomework.bulk.toast.success", {
          count: payload.reviewedCount,
        }),
      );
    }

    setSelectedIds([]);
    setReloadNonce((current) => current + 1);
  };

  const clearAllFilters = useCallback(() => {
    setBannerMessage(null);
    setSearchInput("");
    clearFilters();
    // "Clear all" should remove restrictive filtering and show the full queue surface.
    setFilter("status", "ALL");
  }, [clearFilters, setFilter]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];

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

    const status = typeof state.filters.status === "string" ? state.filters.status : "";
    if (status && status !== "ALL") {
      const statusKey =
        status === "ASSIGNED"
          ? "homework.status.assigned"
          : status === "SUBMITTED"
            ? "homework.status.submitted"
          : status === "REVIEWED"
              ? "homework.status.reviewed"
              : "homework.status.submitted";
      chips.push({
        key: "status",
        label: t("staffHomework.filters.status"),
        value: t(statusKey),
        // Removing status chip should widen scope to all statuses instead of re-locking SUBMITTED.
        onRemove: () => setFilter("status", "ALL"),
      });
    }

    const from = typeof state.filters.from === "string" ? state.filters.from : "";
    const to = typeof state.filters.to === "string" ? state.filters.to : "";
    if (from || to) {
      chips.push({
        key: "dateRange",
        label: t("staffHomework.filters.dateRange"),
        value: `${from || t("generic.dash")} - ${to || t("generic.dash")}`,
        onRemove: () => {
          const nextFilters = { ...state.filters };
          delete nextFilters.from;
          delete nextFilters.to;
          setFilters(nextFilters);
        },
      });
    }

    if (mode === "admin") {
      const tutorId = typeof state.filters.tutorId === "string" ? state.filters.tutorId : "";
      if (tutorId) {
        chips.push({
          key: "tutorId",
          label: t("staffHomework.filters.tutor"),
          value: tutors.find((option) => option.id === tutorId)?.name ?? tutorId,
          onRemove: () => setFilter("tutorId", null),
        });
      }
      const centerId = typeof state.filters.centerId === "string" ? state.filters.centerId : "";
      if (centerId) {
        chips.push({
          key: "centerId",
          label: t("staffHomework.filters.center"),
          value: centers.find((option) => option.id === centerId)?.name ?? centerId,
          onRemove: () => setFilter("centerId", null),
        });
      }
    }

    return chips;
  }, [centers, mode, setFilter, setFilters, setSearch, state.filters, state.search, t, tutors]);

  const toggleSelectedId = (homeworkItemId: string) => {
    setSelectedIds((current) => {
      if (current.includes(homeworkItemId)) {
        return current.filter((id) => id !== homeworkItemId);
      }
      return [...current, homeworkItemId];
    });
  };

  const columns = useMemo<AdminDataTableColumn<HomeworkQueueRow>[]>(() => {
    const baseColumns: AdminDataTableColumn<HomeworkQueueRow>[] = [
      {
        key: "select",
        label: t("staffHomework.table.select"),
        renderCell: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.includes(row.homeworkItemId)}
            onChange={() => toggleSelectedId(row.homeworkItemId)}
            onClick={(event) => event.stopPropagation()}
            aria-label={t("staffHomework.table.selectRow")}
          />
        ),
      },
      {
        key: "submittedAt",
        sortField: "submittedAt",
        label: t("staffHomework.table.submittedAt"),
        sortable: true,
        renderCell: (row) => formatDateTime(row.submittedAt, locale) ?? t("generic.dash"),
      },
      {
        key: "student",
        label: t("staffHomework.table.student"),
        renderCell: (row) => row.studentDisplay,
      },
      {
        key: "sessionTime",
        label: t("staffHomework.table.sessionTime"),
        renderCell: (row) => formatDateTime(row.sessionStartAt, locale) ?? t("generic.dash"),
      },
    ];

    if (mode === "admin") {
      baseColumns.push({
        key: "tutor",
        label: t("staffHomework.table.tutor"),
        renderCell: (row) => row.tutorDisplay ?? t("generic.dash"),
      });
    }

    baseColumns.push(
      {
        key: "status",
        label: t("staffHomework.table.status"),
        renderCell: (row) => (
          <HomeworkStatusBadge
            status={toHomeworkDisplayStatus({
              status: row.status,
              assignmentCount: row.fileCounts.assignment,
            })}
          />
        ),
      },
      {
        key: "files",
        label: t("staffHomework.table.hasFiles"),
        renderCell: (row) => (
          <span className="text-xs text-slate-700">
            {t("staffHomework.table.filesCompact", {
              assignment: row.fileCounts.assignment,
              submission: row.fileCounts.submission,
              feedback: row.fileCounts.feedback,
            })}
          </span>
        ),
      },
    );

    return baseColumns;
  }, [locale, mode, selectedIds, t]);

  const emptyState = {
    title: t("staffHomework.queue.empty.title"),
    body: t("staffHomework.queue.empty.body"),
    ctaLabel: t("staffHomework.queue.empty.cta"),
    onCta: clearAllFilters,
  };

  return (
    <div className="flex flex-col gap-4" data-testid={`staff-homework-queue-${mode}`}>
      <AdminTableToolbar
        searchId={`homework-queue-${mode}-search`}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAllFilters}
        searchPlaceholder={t("staffHomework.queue.search.placeholder")}
        rightSlot={
          <button
            type="button"
            className={primaryButton}
            disabled={!hasSelection}
            onClick={() => setIsBulkModalOpen(true)}
          >
            {t("staffHomework.bulk.markReviewed")}
          </button>
        }
      />

      {bannerMessage ? (
        <section className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {bannerMessage}
        </section>
      ) : null}

      {error ? (
        <AdminErrorPanel
          title={t("staffHomework.queue.error.title")}
          body={error}
          onRetry={() => setReloadNonce((current) => current + 1)}
        />
      ) : (
        <>
          <AdminDataTable<HomeworkQueueRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `staff-homework-row-${row.homeworkItemId}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={(row) => router.push(getDetailHref(mode, tenant, row.homeworkItemId))}
            testId={`staff-homework-table-${mode}`}
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
        onReset={clearAllFilters}
      >
        <AdminFormField label={t("staffHomework.filters.status")} htmlFor={`homework-status-${mode}`}>
          <select
            id={`homework-status-${mode}`}
            className={inputBase}
            value={typeof state.filters.status === "string" ? state.filters.status : "SUBMITTED"}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="ALL">{t("staffHomework.filters.statusAll")}</option>
            <option value="ASSIGNED">{t("homework.status.assigned")}</option>
            <option value="SUBMITTED">{t("homework.status.submitted")}</option>
            <option value="REVIEWED">{t("homework.status.reviewed")}</option>
          </select>
        </AdminFormField>

        <AdminFormField
          label={t("staffHomework.filters.dateFrom")}
          htmlFor={`homework-from-${mode}`}
        >
          <input
            id={`homework-from-${mode}`}
            type="date"
            className={inputBase}
            value={typeof state.filters.from === "string" ? state.filters.from : ""}
            onChange={(event) => setFilter("from", event.target.value || null)}
          />
        </AdminFormField>

        <AdminFormField label={t("staffHomework.filters.dateTo")} htmlFor={`homework-to-${mode}`}>
          <input
            id={`homework-to-${mode}`}
            type="date"
            className={inputBase}
            value={typeof state.filters.to === "string" ? state.filters.to : ""}
            onChange={(event) => setFilter("to", event.target.value || null)}
          />
        </AdminFormField>

        {mode === "admin" ? (
          <>
            <AdminFormField label={t("staffHomework.filters.tutor")} htmlFor="homework-tutor-filter">
              <select
                id="homework-tutor-filter"
                className={inputBase}
                value={typeof state.filters.tutorId === "string" ? state.filters.tutorId : ""}
                onChange={(event) => setFilter("tutorId", event.target.value || null)}
              >
                <option value="">{t("staffHomework.filters.tutorAll")}</option>
                {tutors.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </AdminFormField>

            <AdminFormField label={t("staffHomework.filters.center")} htmlFor="homework-center-filter">
              <select
                id="homework-center-filter"
                className={inputBase}
                value={typeof state.filters.centerId === "string" ? state.filters.centerId : ""}
                onChange={(event) => setFilter("centerId", event.target.value || null)}
              >
                <option value="">{t("staffHomework.filters.centerAll")}</option>
                {centers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </AdminFormField>
          </>
        ) : null}
      </AdminFiltersSheet>

      {isBulkModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("staffHomework.bulk.confirm.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("staffHomework.bulk.confirm.body", { count: selectedIds.length })}
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setIsBulkModalOpen(false)}
                disabled={isSubmittingBulk}
              >
                {t("staffHomework.bulk.confirm.cancel")}
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => void onConfirmBulkMarkReviewed()}
                disabled={isSubmittingBulk}
              >
                {isSubmittingBulk
                  ? t("staffHomework.bulk.confirm.processing")
                  : t("staffHomework.bulk.confirm.confirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
