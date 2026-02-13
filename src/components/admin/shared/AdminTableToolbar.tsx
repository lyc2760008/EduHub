// Shared admin table toolbar provides search, filter chips, and optional CSV export affordance.
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";

export type AdminFilterChip = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

type AdminTableToolbarProps = {
  searchId: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  filterChips: AdminFilterChip[];
  onClearAllFilters: () => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  filtersLabel?: string;
  clearAllLabel?: string;
  showExportButton?: boolean;
  onExportCsv?: () => void;
  isExporting?: boolean;
  exportDisabled?: boolean;
  exportLabel?: string;
  exportingLabel?: string;
  exportHint?: string | null;
  rightSlot?: ReactNode;
};

export default function AdminTableToolbar({
  searchId,
  searchValue,
  onSearchChange,
  onOpenFilters,
  filterChips,
  onClearAllFilters,
  searchLabel,
  searchPlaceholder,
  filtersLabel,
  clearAllLabel,
  showExportButton = false,
  onExportCsv,
  isExporting = false,
  exportDisabled = false,
  exportLabel,
  exportingLabel,
  exportHint,
  rightSlot,
}: AdminTableToolbarProps) {
  const t = useTranslations();
  // Optional override props let module-specific contracts supply copy while preserving toolkit layout.
  const resolvedSearchLabel = searchLabel ?? t("admin.table.search.label");
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("admin.table.search.placeholder");
  const resolvedFiltersLabel = filtersLabel ?? t("admin.table.filters.label");
  const resolvedClearAllLabel = clearAllLabel ?? t("admin.table.filters.clearAll");
  const resolvedExportLabel = exportLabel ?? t("admin.table.exportCsv");
  const resolvedExportingLabel =
    exportingLabel ?? t("admin.table.export.preparing");
  const resolvedExportHint =
    exportHint === undefined ? t("admin.table.export.warning") : exportHint;

  return (
    <section
      className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4"
      data-testid={`${searchId}-toolbar`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={searchId}>
            {resolvedSearchLabel}
          </label>
          <input
            id={searchId}
            className={`${inputBase} min-w-[220px] flex-1`}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={resolvedSearchPlaceholder}
            data-testid={`${searchId}-input`}
          />
          <button
            type="button"
            className={secondaryButton}
            onClick={onOpenFilters}
            data-testid={`${searchId}-filters-button`}
          >
            {resolvedFiltersLabel}
          </button>
        </div>

        <div className="flex min-w-[220px] flex-col items-end gap-2">
          {showExportButton ? (
            <button
              type="button"
              className={primaryButton}
              onClick={onExportCsv}
              disabled={exportDisabled || isExporting}
              data-testid={`${searchId}-export-csv`}
            >
              {isExporting ? resolvedExportingLabel : resolvedExportLabel}
            </button>
          ) : null}
          {showExportButton && resolvedExportHint ? (
            <p className="max-w-[320px] text-right text-xs text-slate-500">
              {resolvedExportHint}
            </p>
          ) : null}
          {rightSlot}
        </div>
      </div>

      {filterChips.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
              onClick={chip.onRemove}
              data-testid={`${searchId}-filter-chip-${chip.key}`}
            >
              <span>{`${chip.label}: ${chip.value}`}</span>
              <span aria-hidden="true">x</span>
            </button>
          ))}
          {filterChips.length ? (
            <button
              type="button"
              className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              onClick={onClearAllFilters}
              data-testid={`${searchId}-filters-clear-all`}
            >
              {resolvedClearAllLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
