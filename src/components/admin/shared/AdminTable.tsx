// Minimal admin table component for reuse across admin client views.
// Keep visuals consistent and utilitarian; callers provide localized empty/loading content.
"use client";

import type { ReactNode } from "react";

export type AdminTableColumn<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  headClassName?: string;
  cellClassName?: string;
};

export type AdminTableProps<T> = {
  rows: T[];
  columns: AdminTableColumn<T>[];
  rowKey: (row: T) => string;
  testId?: string;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
};

export default function AdminTable<T>({
  rows,
  columns,
  rowKey,
  testId,
  emptyState,
  loadingState,
  isLoading = false,
  onRowClick,
}: AdminTableProps<T>) {
  const showRows = rows.length > 0;
  const colSpan = columns.length || 1;
  const showLoading = isLoading && !showRows;
  const showEmpty = !isLoading && !showRows;
  // Optional row click enables drawer-style interactions without changing table markup.
  const rowInteractiveClassName = onRowClick ? "cursor-pointer" : "";

  // i18n: callers supply localized empty/loading content to avoid hardcoded copy.
  const loadingContent = loadingState ?? (
    <div className="mx-auto h-4 w-24 rounded bg-slate-200" aria-hidden="true" />
  );
  const emptyContent = emptyState ?? (
    <div className="mx-auto h-4 w-28 rounded bg-slate-100" aria-hidden="true" />
  );

  // Wrapper keeps consistent borders/rounding across admin tables.
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <table className="w-full text-left text-sm" data-testid={testId}>
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                className={
                  column.headClassName ?? "px-4 py-3 text-left font-medium"
                }
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {showRows
            ? rows.map((row) => {
                const key = rowKey(row);
                const isInteractive = Boolean(onRowClick);
                return (
                  <tr
                    key={key}
                    className={`transition-colors hover:bg-slate-50 ${rowInteractiveClassName}`}
                    data-testid={key}
                    onClick={isInteractive ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      isInteractive
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick?.(row);
                            }
                          }
                        : undefined
                    }
                    role={isInteractive ? "button" : undefined}
                    tabIndex={isInteractive ? 0 : undefined}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={index}
                        className={
                          column.cellClassName ?? "px-4 py-3 align-middle"
                        }
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            : null}
          {showLoading || showEmpty ? (
            // Always render a single placeholder row so the tbody never looks empty.
            <tr>
              <td
                className="px-4 py-6 text-center text-sm text-slate-500"
                colSpan={colSpan}
              >
                {showLoading ? loadingContent : emptyContent}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
