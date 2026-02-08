// Shared filter sheet matches contract: right-side drawer on desktop and full-screen panel on mobile.
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";

type AdminFiltersSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  children: ReactNode;
};

export default function AdminFiltersSheet({
  isOpen,
  onClose,
  onReset,
  children,
}: AdminFiltersSheetProps) {
  const t = useTranslations();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
      <section
        className="h-full w-full overflow-y-auto bg-white p-4 sm:p-6 md:w-[420px]"
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.table.filters.label")}
        data-testid="admin-filters-sheet"
      >
        <div className="flex h-full flex-col gap-4">
          <header className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.table.filters.label")}
            </h2>
            <button
              type="button"
              className={secondaryButton}
              onClick={onClose}
              data-testid="admin-filters-sheet-header-close"
            >
              {t("actions.close")}
            </button>
          </header>
          <div className="flex-1 space-y-4">{children}</div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className={secondaryButton}
              onClick={onReset}
              data-testid="admin-filters-sheet-reset"
            >
              {t("admin.table.filters.reset")}
            </button>
            <button
              type="button"
              className={primaryButton}
              onClick={onClose}
              data-testid="admin-filters-sheet-close"
            >
              {t("actions.close")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
