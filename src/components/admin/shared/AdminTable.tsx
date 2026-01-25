// Minimal admin table component for reuse across admin client views.
// Provide columns + rowKey and optionally empty/loading content for localized UX.
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
  isLoading?: boolean;
};

export default function AdminTable<T>({
  rows,
  columns,
  rowKey,
  testId,
  emptyState,
  isLoading = false,
}: AdminTableProps<T>) {
  const showRows = rows.length > 0;
  const colSpan = columns.length || 1;
  // i18n: callers supply localized empty/loading content to avoid hardcoded copy.
  const emptyContent = emptyState ?? null;

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <table className="w-full text-left text-sm" data-testid={testId}>
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={column.headClassName ?? "px-4 py-3"}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showRows
            ? rows.map((row) => {
                const key = rowKey(row);
                return (
                  <tr
                    key={key}
                    className="border-t border-slate-200"
                    data-testid={key}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={index}
                        className={column.cellClassName ?? "px-4 py-3"}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            : null}
          {!showRows && isLoading && emptyContent ? (
            <tr className="border-t border-slate-200">
              <td
                className="px-4 py-6 text-center text-sm text-slate-500"
                colSpan={colSpan}
              >
                {emptyContent}
              </td>
            </tr>
          ) : null}
          {!showRows && !isLoading && emptyContent ? (
            <tr className="border-t border-slate-200">
              <td
                className="px-4 py-6 text-center text-sm text-slate-500"
                colSpan={colSpan}
              >
                {emptyContent}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
