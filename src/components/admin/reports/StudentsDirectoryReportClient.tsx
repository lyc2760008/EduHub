// Students directory report is wired to the shared students report API for URL-safe list state + CSV export.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { StudentStatus } from "@/generated/prisma/client";
import type { AdminReportLevelOption } from "@/lib/reports/adminReportOptions";
import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminPagination from "@/components/admin/shared/AdminPagination";
import AdminTableToolbar, {
  type AdminFilterChip,
} from "@/components/admin/shared/AdminTableToolbar";
import {
  AdminErrorPanel,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import { inputBase } from "@/components/admin/shared/adminUiClasses";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";
import { useAdminReportTable } from "@/components/admin/reports/useAdminReportTable";

type DirectoryStatusFilter = "ACTIVE" | "INACTIVE" | "ALL";
type ParentFilter = "ANY" | "HAS_PARENTS" | "NO_PARENTS";

type StudentDirectoryRow = {
  id: string;
  name: string;
  status: StudentStatus;
  levelName: string | null;
  parentCount: number;
  createdAt: string;
};

type StudentsDirectoryReportClientProps = {
  tenant: string;
  levels: AdminReportLevelOption[];
};

const DEFAULT_STATUS: DirectoryStatusFilter = "ACTIVE";
const DEFAULT_PARENT_FILTER: ParentFilter = "ANY";

function formatDate(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

function getStatusLabel(status: StudentStatus, t: ReturnType<typeof useTranslations>) {
  if (status === "ACTIVE") return t("common.status.active");
  return t("common.status.inactive");
}

export default function StudentsDirectoryReportClient({
  tenant,
  levels,
}: StudentsDirectoryReportClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "name",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["status", "levelId", "hasParents"],
    });

  // Default status keeps the first-load roster focused on active students.
  useEffect(() => {
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    if (!status) {
      setFilter("status", DEFAULT_STATUS);
    }
  }, [setFilter, state.filters.status]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const {
    rows,
    totalCount,
    isLoading,
    error,
    exportError,
    isExporting,
    reload,
    exportCsv,
  } = useAdminReportTable<StudentDirectoryRow>({
    tenant,
    reportId: "students",
    tableState: state,
  });

  const clearAll = useCallback(() => {
    clearFilters();
    setSearch("");
    setSearchInput("");
    setFilter("status", DEFAULT_STATUS);
  }, [clearFilters, setFilter, setSearch]);

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const status =
      typeof state.filters.status === "string" ? state.filters.status : "";
    if (status && status !== DEFAULT_STATUS) {
      chips.push({
        key: "status",
        label: t("admin.reports.filters.status"),
        value: t(`admin.reports.statusFilter.${status.toLowerCase()}`),
        onRemove: () => setFilter("status", DEFAULT_STATUS),
      });
    }

    const levelId =
      typeof state.filters.levelId === "string" ? state.filters.levelId : "";
    if (levelId) {
      chips.push({
        key: "levelId",
        label: t("admin.reports.filters.levelGrade"),
        value: levels.find((option) => option.id === levelId)?.name ?? levelId,
        onRemove: () => setFilter("levelId", ""),
      });
    }

    if (typeof state.filters.hasParents === "boolean") {
      chips.push({
        key: "hasParents",
        label: t("admin.reports.students.columns.parents"),
        value: state.filters.hasParents
          ? t("admin.reports.students.filters.parents.linked")
          : t("admin.reports.students.filters.parents.unlinked"),
        onRemove: () => setFilter("hasParents", null),
      });
    }

    if (state.search.trim()) {
      chips.unshift({
        key: "search",
        label: t("admin.table.search.label"),
        value: state.search.trim(),
        onRemove: () => setSearch(""),
      });
    }

    return chips;
  }, [levels, setFilter, setSearch, state.filters, state.search, t]);

  const columns = useMemo<AdminDataTableColumn<StudentDirectoryRow>[]>(
    () => [
      {
        key: "name",
        sortField: "name",
        sortable: true,
        label: t("admin.reports.students.columns.studentName"),
        renderCell: (row) => row.name,
      },
      {
        key: "status",
        sortField: "status",
        sortable: true,
        label: t("admin.reports.students.columns.status"),
        renderCell: (row) => getStatusLabel(row.status, t),
      },
      {
        key: "levelName",
        label: t("admin.students.table.level"),
        renderCell: (row) => row.levelName ?? t("generic.dash"),
      },
      {
        key: "parentCount",
        label: t("admin.students.table.parentCount"),
        renderCell: (row) => row.parentCount,
      },
      {
        key: "createdAt",
        sortField: "createdAt",
        sortable: true,
        label: t("admin.students.table.createdAt"),
        renderCell: (row) => formatDate(row.createdAt, locale),
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.reports.students.empty.title"),
      body: t("admin.reports.students.empty.body"),
      ctaLabel: t("admin.reports.students.empty.cta"),
      onCta: clearAll,
    }),
    [clearAll, t],
  );

  const parentFilterValue: ParentFilter =
    typeof state.filters.hasParents === "boolean"
      ? state.filters.hasParents
        ? "HAS_PARENTS"
        : "NO_PARENTS"
      : DEFAULT_PARENT_FILTER;

  return (
    <div className="flex flex-col gap-4" data-testid="report-students-directory">
      <AdminTableToolbar
        searchId="students-directory-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        showExportButton
        onExportCsv={() => void exportCsv()}
        isExporting={isExporting}
        exportDisabled={isLoading || Boolean(error)}
      />

      {error ? <AdminErrorPanel onRetry={reload} /> : null}
      {exportError ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </p>
      ) : null}

      {!error ? (
        <>
          <AdminDataTable<StudentDirectoryRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => `report-student-${row.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            mobileCardClassName="rounded border border-slate-200 bg-white p-3"
            testId="report-students-directory-table"
          />
          <AdminPagination
            page={state.page}
            pageSize={state.pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      ) : null}

      <AdminFiltersSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        onReset={clearAll}
      >
        <AdminFormField
          label={t("admin.reports.filters.status")}
          htmlFor="students-directory-status"
        >
          <select
            id="students-directory-status"
            className={inputBase}
            value={typeof state.filters.status === "string" ? state.filters.status : DEFAULT_STATUS}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="ACTIVE">{t("admin.reports.statusFilter.active")}</option>
            <option value="INACTIVE">{t("admin.reports.statusFilter.inactive")}</option>
            <option value="ALL">{t("admin.reports.statusFilter.all")}</option>
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.reports.filters.levelGrade")}
          htmlFor="students-directory-level"
        >
          <select
            id="students-directory-level"
            className={inputBase}
            value={typeof state.filters.levelId === "string" ? state.filters.levelId : ""}
            onChange={(event) => setFilter("levelId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allLevels")}</option>
            {levels.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.reports.students.columns.parents")}
          htmlFor="students-directory-parents"
        >
          <select
            id="students-directory-parents"
            className={inputBase}
            value={parentFilterValue}
            onChange={(event) => {
              if (event.target.value === "HAS_PARENTS") {
                setFilter("hasParents", true);
                return;
              }
              if (event.target.value === "NO_PARENTS") {
                setFilter("hasParents", false);
                return;
              }
              setFilter("hasParents", null);
            }}
          >
            <option value="ANY">{t("admin.reports.students.filters.parents.any")}</option>
            <option value="HAS_PARENTS">
              {t("admin.reports.students.filters.parents.linked")}
            </option>
            <option value="NO_PARENTS">
              {t("admin.reports.students.filters.parents.unlinked")}
            </option>
          </select>
        </AdminFormField>
      </AdminFiltersSheet>
    </div>
  );
}
