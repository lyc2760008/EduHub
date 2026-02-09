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
  showExportButton?: boolean;
  onExportCsv?: () => void;
  isExporting?: boolean;
  exportDisabled?: boolean;
  rightSlot?: ReactNode;
};

export default function AdminTableToolbar({
  searchId,
  searchValue,
  onSearchChange,
  onOpenFilters,
  filterChips,
  onClearAllFilters,
  showExportButton = false,
  onExportCsv,
  isExporting = false,
  exportDisabled = false,
  rightSlot,
}: AdminTableToolbarProps) {
  const t = useTranslations();

  return (
    <section
      className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4"
      data-testid={`${searchId}-toolbar`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={searchId}>
            {t("admin.table.search.label")}
          </label>
          <input
            id={searchId}
            className={`${inputBase} min-w-[220px] flex-1`}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("admin.table.search.placeholder")}
            data-testid={`${searchId}-input`}
          />
          <button
            type="button"
            className={secondaryButton}
            onClick={onOpenFilters}
            data-testid={`${searchId}-filters-button`}
          >
            {t("admin.table.filters.label")}
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
              {isExporting
                ? t("admin.table.export.preparing")
                : t("admin.table.exportCsv")}
            </button>
          ) : null}
          {showExportButton ? (
            <p className="max-w-[320px] text-right text-xs text-slate-500">
              {t("admin.table.export.warning")}
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
              {t("admin.table.filters.clearAll")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
