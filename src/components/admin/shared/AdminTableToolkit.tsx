"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";

type SortDirection = "asc" | "desc";

export type AdminToolkitColumn<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  renderCell: (row: T) => ReactNode;
  getSortValue?: (row: T) => string | number | Date | null | undefined;
};

export type AdminToolkitCardField<T> = {
  key: string;
  label: string;
  renderValue: (row: T) => ReactNode;
};

export type AdminToolkitCsvColumn<T> = {
  key: string;
  header: string;
  getValue: (row: T) => string | number | null | undefined;
};

export type AdminToolkitFilterChip = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

export type AdminToolkitEmptyState = {
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export type AdminTableToolkitProps<T> = {
  rows: T[];
  rowKey: (row: T) => string;
  columns: AdminToolkitColumn<T>[];
  cardFields: AdminToolkitCardField<T>[];
  csvColumns: AdminToolkitCsvColumn<T>[];
  defaultSort: {
    key: string;
    direction: SortDirection;
  };
  getSearchText: (row: T) => string;
  filterChips: AdminToolkitFilterChip[];
  filterContent: ReactNode;
  onResetFilters: () => void;
  emptyState: AdminToolkitEmptyState;
  exportFileName: string;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  mobileCardVariant?: "default" | "compact";
  testId?: string;
};

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function normalizeSortValue(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return value.toLowerCase();
  return value;
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  direction: SortDirection,
) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a < b) return direction === "asc" ? -1 : 1;
  if (a > b) return direction === "asc" ? 1 : -1;
  return 0;
}

function escapeCsvCell(value: string | number | null | undefined) {
  const safeValue = value === null || value === undefined ? "" : String(value);
  const escaped = safeValue.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildCsvContent<T>(
  columns: AdminToolkitCsvColumn<T>[],
  rows: T[],
): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.getValue(row))).join(","),
  );
  return [header, ...lines].join("\n");
}

export default function AdminTableToolkit<T>({
  rows,
  rowKey,
  columns,
  cardFields,
  csvColumns,
  defaultSort,
  getSearchText,
  filterChips,
  filterContent,
  onResetFilters,
  emptyState,
  exportFileName,
  isLoading,
  error,
  onRetry,
  mobileCardVariant = "default",
  testId,
}: AdminTableToolkitProps<T>) {
  const t = useTranslations();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState(defaultSort);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize, sort.key, sort.direction, debouncedSearch]);

  const combinedFilterChips = useMemo(() => {
    if (!debouncedSearch) return filterChips;
    return [
      {
        key: "__search",
        label: t("admin.table.search.label"),
        value: debouncedSearch,
        onRemove: () => setSearchInput(""),
      },
      ...filterChips,
    ];
  }, [debouncedSearch, filterChips, t]);

  const filteredRows = useMemo(() => {
    if (!debouncedSearch) return rows;
    const needle = debouncedSearch.toLowerCase();
    return rows.filter((row) => getSearchText(row).toLowerCase().includes(needle));
  }, [debouncedSearch, getSearchText, rows]);

  const sortedRows = useMemo(() => {
    const activeColumn = columns.find((column) => column.key === sort.key);
    if (!activeColumn?.sortable || !activeColumn.getSortValue) {
      return filteredRows;
    }
    return [...filteredRows].sort((left, right) => {
      const leftValue = normalizeSortValue(activeColumn.getSortValue?.(left));
      const rightValue = normalizeSortValue(activeColumn.getSortValue?.(right));
      return compareValues(leftValue, rightValue, sort.direction);
    });
  }, [columns, filteredRows, sort.direction, sort.key]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const pageStart = totalRows === 0 ? 0 : (normalizedPage - 1) * pageSize;
  const pageRows = sortedRows.slice(pageStart, pageStart + pageSize);
  const rangeFrom = totalRows === 0 ? 0 : pageStart + 1;
  const rangeTo = totalRows === 0 ? 0 : Math.min(pageStart + pageSize, totalRows);

  const activeSortColumn = columns.find((column) => column.key === sort.key);

  const clearAllFilters = () => {
    setSearchInput("");
    onResetFilters();
  };

  const toggleSort = (columnKey: string) => {
    setSort((current) => {
      if (current.key !== columnKey) {
        return { key: columnKey, direction: "asc" };
      }
      return {
        key: columnKey,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const exportCsv = () => {
    setIsExporting(true);
    try {
      const csv = buildCsvContent(csvColumns, sortedRows);
      const blob = new Blob([`\uFEFF${csv}`], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const cardClassName =
    mobileCardVariant === "compact"
      ? "rounded border border-slate-200 bg-white p-3"
      : "rounded border border-slate-200 bg-white p-4";

  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      <section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-1 min-w-[220px] flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`${testId ?? "toolkit"}-search`}>
              {t("admin.table.search.label")}
            </label>
            <input
              id={`${testId ?? "toolkit"}-search`}
              className={`${inputBase} min-w-[220px] flex-1`}
              placeholder={t("admin.table.search.placeholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setIsFilterDrawerOpen(true)}
            >
              {t("admin.table.filters.label")}
            </button>
          </div>
          <div className="flex min-w-[220px] flex-col items-end gap-2">
            <button
              type="button"
              className={primaryButton}
              onClick={exportCsv}
              disabled={isExporting || sortedRows.length === 0}
            >
              {isExporting
                ? t("admin.table.export.preparing")
                : t("admin.table.exportCsv")}
            </button>
            <p className="max-w-[320px] text-right text-xs text-slate-500">
              {t("admin.table.export.warning")}
            </p>
          </div>
        </div>

        {combinedFilterChips.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {combinedFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                onClick={chip.onRemove}
              >
                <span>{`${chip.label}: ${chip.value}`}</span>
                <span aria-hidden="true">x</span>
              </button>
            ))}
            {combinedFilterChips.length > 1 ? (
              <button
                type="button"
                className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                onClick={clearAllFilters}
              >
                {t("admin.table.filters.clearAll")}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <section className="rounded border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">
            {t("admin.table.state.error.title")}
          </p>
          <p className="mt-1 text-sm text-red-700">{t("admin.table.state.error.body")}</p>
          <button
            type="button"
            className={`${secondaryButton} mt-3`}
            onClick={onRetry}
          >
            {t("admin.table.state.error.retry")}
          </button>
        </section>
      ) : null}

      {!error ? (
        <>
          <div className="hidden overflow-hidden rounded border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  {columns.map((column) => {
                    const isSorted = column.key === sort.key;
                    const isSortable = Boolean(column.sortable && column.getSortValue);
                    const icon = !isSortable
                      ? null
                      : !isSorted
                        ? "↕"
                        : sort.direction === "asc"
                          ? "↑"
                          : "↓";
                    return (
                      <th key={column.key} className="px-4 py-3 font-medium">
                        {isSortable ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-left text-slate-700 hover:text-slate-900"
                            onClick={() => toggleSort(column.key)}
                          >
                            <span>{column.label}</span>
                            <span aria-hidden="true" className="text-xs">
                              {icon}
                            </span>
                            {isSorted ? (
                              <span className="sr-only">
                                {sort.direction === "asc"
                                  ? t("admin.table.sort.sortedAscending")
                                  : t("admin.table.sort.sortedDescending")}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          column.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading && pageRows.length === 0 ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={`loading-row-${index}`}>
                      <td
                        colSpan={columns.length}
                        className="px-4 py-4 text-sm text-slate-500"
                      >
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : null}
                {!isLoading && pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-center">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {emptyState.title}
                        </p>
                        <p className="text-sm text-slate-600">{emptyState.body}</p>
                        {emptyState.ctaLabel && emptyState.onCta ? (
                          <button
                            type="button"
                            className={secondaryButton}
                            onClick={emptyState.onCta}
                          >
                            {emptyState.ctaLabel}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {pageRows.map((row) => (
                  <tr key={rowKey(row)} className="align-top hover:bg-slate-50">
                    {columns.map((column) => (
                      <td key={`${rowKey(row)}-${column.key}`} className="px-4 py-3">
                        {column.renderCell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {isLoading && pageRows.length === 0 ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`mobile-skeleton-${index}`}
                  className="rounded border border-slate-200 bg-white p-4"
                >
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                  <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                </div>
              ))
            ) : null}
            {!isLoading && pageRows.length === 0 ? (
              <div className="rounded border border-slate-200 bg-white p-4 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  {emptyState.title}
                </p>
                <p className="mt-1 text-sm text-slate-600">{emptyState.body}</p>
                {emptyState.ctaLabel && emptyState.onCta ? (
                  <button
                    type="button"
                    className={`${secondaryButton} mt-3`}
                    onClick={emptyState.onCta}
                  >
                    {emptyState.ctaLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
            {pageRows.map((row) => (
              <article key={rowKey(row)} className={cardClassName}>
                <dl className="grid gap-2">
                  {cardFields.map((field) => (
                    <div key={`${rowKey(row)}-${field.key}`} className="grid gap-0.5">
                      <dt className="text-xs font-semibold text-slate-500">
                        {field.label}
                      </dt>
                      <dd className="text-sm text-slate-800">{field.renderValue(row)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600" htmlFor={`${testId ?? "toolkit"}-page-size`}>
                {t("admin.table.pagination.rowsPerPage")}
              </label>
              <select
                id={`${testId ?? "toolkit"}-page-size`}
                className={inputBase}
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-sm text-slate-600">
              {t("admin.table.pagination.of", {
                from: rangeFrom,
                to: rangeTo,
                total: totalRows,
              })}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={normalizedPage <= 1}
              >
                {t("admin.table.pagination.prev")}
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={normalizedPage >= totalPages}
              >
                {t("admin.table.pagination.next")}
              </button>
            </div>
          </footer>
        </>
      ) : null}

      {isFilterDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <section
            className="h-full w-full overflow-y-auto bg-white p-4 sm:p-6 md:w-[420px]"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-full flex-col gap-4">
              <header className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("admin.table.filters.label")}
                </h2>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setIsFilterDrawerOpen(false)}
                >
                  {t("actions.close")}
                </button>
              </header>
              <div className="flex-1 space-y-4">{filterContent}</div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={onResetFilters}
                >
                  {t("admin.table.filters.reset")}
                </button>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => setIsFilterDrawerOpen(false)}
                >
                  {t("actions.close")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {isLoading ? t("admin.table.state.loading") : ""}
        {activeSortColumn
          ? sort.direction === "asc"
            ? t("admin.table.sort.sortedAscending")
            : t("admin.table.sort.sortedDescending")
          : ""}
      </span>
    </div>
  );
}
