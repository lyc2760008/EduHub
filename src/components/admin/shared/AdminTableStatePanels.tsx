// Shared loading/empty/error blocks keep list-state handling consistent across admin pages.
"use client";

import { useTranslations } from "next-intl";

import { secondaryButton } from "@/components/admin/shared/adminUiClasses";

export type AdminEmptyState = {
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
};

type AdminErrorPanelProps = {
  onRetry: () => void;
  title?: string;
  body?: string;
  retryLabel?: string;
};

type AdminEmptyPanelProps = {
  emptyState: AdminEmptyState;
};

type AdminLoadingRowsProps = {
  rowCount?: number;
  colSpan: number;
};

export function AdminErrorPanel({
  onRetry,
  title,
  body,
  retryLabel,
}: AdminErrorPanelProps) {
  const t = useTranslations();
  // Module-specific copy can override defaults while preserving the shared error panel styling.
  const resolvedTitle = title ?? t("admin.table.state.error.title");
  const resolvedBody = body ?? t("admin.table.state.error.body");
  const resolvedRetryLabel = retryLabel ?? t("admin.table.state.error.retry");

  return (
    <section
      className="rounded border border-red-200 bg-red-50 px-4 py-3"
      data-testid="admin-table-error"
    >
      <p className="text-sm font-semibold text-red-700">
        {resolvedTitle}
      </p>
      <p className="mt-1 text-sm text-red-700">{resolvedBody}</p>
      <button
        type="button"
        className={`${secondaryButton} mt-3`}
        onClick={onRetry}
      >
        {resolvedRetryLabel}
      </button>
    </section>
  );
}

export function AdminEmptyPanel({ emptyState }: AdminEmptyPanelProps) {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-2 px-2 py-8 text-center"
      data-testid="admin-table-empty"
    >
      <p className="text-sm font-semibold text-slate-900">{emptyState.title}</p>
      <p className="text-sm text-slate-600">{emptyState.body}</p>
      {emptyState.ctaLabel && emptyState.onCta ? (
        <button type="button" className={secondaryButton} onClick={emptyState.onCta}>
          {emptyState.ctaLabel}
        </button>
      ) : null}
    </div>
  );
}

export function AdminLoadingRows({
  rowCount = 4,
  colSpan,
}: AdminLoadingRowsProps) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, index) => (
        <tr key={`loading-row-${index}`}>
          <td colSpan={colSpan} className="px-4 py-4">
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          </td>
        </tr>
      ))}
    </>
  );
}
