// Shared server-pagination control keeps paging behavior consistent across admin list surfaces.
"use client";

import { useTranslations } from "next-intl";

import {
  inputBase,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";

type AdminPaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function AdminPagination({
  page,
  pageSize,
  totalCount,
  pageSizeOptions = [25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: AdminPaginationProps) {
  const t = useTranslations();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(Math.max(page, 1), totalPages);
  const rangeFrom = totalCount === 0 ? 0 : (normalizedPage - 1) * pageSize + 1;
  const rangeTo =
    totalCount === 0 ? 0 : Math.min(normalizedPage * pageSize, totalCount);

  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200 bg-white px-4 py-3"
      data-testid="admin-pagination"
    >
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600" htmlFor="admin-page-size">
          {t("admin.table.pagination.rowsPerPage")}
        </label>
        <select
          id="admin-page-size"
          className={inputBase}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          data-testid="admin-pagination-page-size"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-slate-600" data-testid="admin-pagination-range">
        {t("admin.table.pagination.of", {
          from: rangeFrom,
          to: rangeTo,
          total: totalCount,
        })}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => onPageChange(Math.max(1, normalizedPage - 1))}
          disabled={normalizedPage <= 1}
          data-testid="admin-pagination-prev"
        >
          {t("admin.table.pagination.prev")}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => onPageChange(Math.min(totalPages, normalizedPage + 1))}
          disabled={normalizedPage >= totalPages}
          data-testid="admin-pagination-next"
        >
          {t("admin.table.pagination.next")}
        </button>
      </div>
    </footer>
  );
}
