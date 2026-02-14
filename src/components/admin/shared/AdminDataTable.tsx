// Shared admin data table renders desktop headers plus stacked mobile cards from one column config.
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  AdminEmptyPanel,
  AdminLoadingRows,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";

export type AdminDataTableColumn<T> = {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  sortField?: string;
  renderCell: (row: T) => ReactNode;
};

type AdminDataTableProps<T> = {
  columns: AdminDataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading: boolean;
  emptyState: AdminEmptyState;
  sortField: string | null;
  sortDir: "asc" | "desc";
  onSortChange: (field: string | null, dir: "asc" | "desc" | null) => void;
  mobileCardClassName?: string;
  onRowClick?: (row: T) => void;
  testId?: string;
};

export default function AdminDataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  emptyState,
  sortField,
  sortDir,
  onSortChange,
  mobileCardClassName,
  onRowClick,
  testId,
}: AdminDataTableProps<T>) {
  const t = useTranslations();

  const toggleSort = (field: string) => {
    if (sortField !== field) {
      onSortChange(field, "asc");
      return;
    }
    if (sortDir === "asc") {
      onSortChange(field, "desc");
      return;
    }
    onSortChange(null, null);
  };

  const showEmpty = !isLoading && rows.length === 0;

  return (
    <>
      <div
        className="hidden overflow-hidden rounded border border-slate-200 bg-white md:block"
        data-testid={testId ? `${testId}-container` : undefined}
      >
        <table className="w-full text-left text-sm" data-testid={testId}>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              {columns.map((column) => {
                const activeField = column.sortField ?? column.key;
                const isSorted = sortField === activeField;
                const isSortable = Boolean(column.sortable);
                const icon = !isSortable
                  ? null
                  : !isSorted
                    ? "\u2195"
                    : sortDir === "asc"
                      ? "\u2191"
                      : "\u2193";
                return (
                  <th key={column.key} className="px-4 py-3 font-medium">
                    {isSortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-left text-slate-700 hover:text-slate-900"
                        onClick={() => toggleSort(activeField)}
                        data-testid={
                          testId ? `${testId}-sort-${activeField}` : undefined
                        }
                      >
                        <span>{column.label}</span>
                        <span aria-hidden="true" className="text-xs">
                          {icon}
                        </span>
                        {isSorted ? (
                          <span className="sr-only">
                            {sortDir === "asc"
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
            {isLoading && rows.length === 0 ? (
              <AdminLoadingRows colSpan={columns.length} />
            ) : null}
            {showEmpty ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-2">
                  <AdminEmptyPanel emptyState={emptyState} />
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`align-top hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""}`}
                data-testid={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  // Keep default data cells readable on macOS regardless of OS color-scheme preference.
                  <td key={`${rowKey(row)}-${column.key}`} className="px-4 py-3 text-slate-900">
                    {column.renderCell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {isLoading && rows.length === 0
          ? Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`mobile-skeleton-${index}`}
                className="rounded border border-slate-200 bg-white p-4"
              >
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            ))
          : null}
        {showEmpty ? <AdminEmptyPanel emptyState={emptyState} /> : null}
        {rows.map((row) => (
          <article
            key={`mobile-${rowKey(row)}`}
            className={
              `${mobileCardClassName ?? "rounded border border-slate-200 bg-white p-4"} ${
                onRowClick ? "cursor-pointer" : ""
              }`
            }
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <dl className="grid gap-2">
              {columns.map((column) => (
                <div key={`${rowKey(row)}-mobile-${column.key}`} className="grid gap-0.5">
                  <dt className="text-xs font-semibold text-slate-500">
                    {column.label}
                  </dt>
                  <dd className="text-sm text-slate-800">{column.renderCell(row)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
