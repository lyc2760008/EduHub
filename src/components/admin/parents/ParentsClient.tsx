// Parents admin list uses the shared admin table toolkit + query contract for consistency.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminPagination from "@/components/admin/shared/AdminPagination";
import AdminTableToolbar, {
  type AdminFilterChip,
} from "@/components/admin/shared/AdminTableToolbar";
import {
  AdminErrorPanel,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import { buildAdminTableParams } from "@/lib/admin-table/buildAdminTableParams";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";

type ParentListItem = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  studentCount: number;
};

type ParentsResponse = {
  rows: ParentListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type ParentsClientProps = {
  tenant: string;
};

type HasStudentsFilter = "ALL" | "YES" | "NO";

function formatDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

export default function ParentsClient({ tenant }: ParentsClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const [parents, setParents] = useState<ParentListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const { state, setSearch, setFilter, setSort, setPage, setPageSize, resetAll } =
    useAdminTableQueryState({
      defaultSortField: "email",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["hasStudents"],
    });

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadParents = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps parent list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<ParentsResponse>(
        buildTenantApiUrl(tenant, `/parents?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.parents.error.body"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load parents", result.details);
        setListError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setListError(t("admin.parents.error.body"));
        return false;
      }

      setParents(result.data.rows);
      setTotalCount(result.data.totalCount);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadParents();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadParents, reloadNonce]);

  const clearAll = () => {
    setSearchInput("");
    resetAll({ sortField: "email", sortDir: "asc" });
  };

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    if (typeof state.filters.hasStudents === "boolean") {
      chips.push({
        key: "hasStudents",
        label: t("admin.parentsList.filters.hasStudents.label"),
        value: state.filters.hasStudents
          ? t("admin.parentsList.filters.hasStudents.yes")
          : t("admin.parentsList.filters.hasStudents.no"),
        onRemove: () => setFilter("hasStudents", null),
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
  }, [setFilter, setSearch, state.filters.hasStudents, state.search, t]);

  const columns: AdminDataTableColumn<ParentListItem>[] = useMemo(
    () => [
      {
        key: "parent",
        label: t("admin.parentsList.columns.parent"),
        renderCell: (parent) => (
          <span className="font-medium text-slate-900">
            {parent.name?.trim() || parent.email}
          </span>
        ),
      },
      {
        key: "email",
        label: t("admin.parentsList.columns.email"),
        sortable: true,
        sortField: "email",
        renderCell: (parent) => parent.email,
      },
      {
        key: "students",
        label: t("admin.parentsList.columns.students"),
        renderCell: (parent) => parent.studentCount,
      },
      {
        key: "createdAt",
        label: t("admin.parentsList.columns.createdAt"),
        sortable: true,
        sortField: "createdAt",
        renderCell: (parent) => formatDateTime(parent.createdAt, locale),
      },
    ],
    [locale, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.parentsList.empty.title"),
      body: t("admin.parentsList.empty.body"),
    }),
    [t],
  );

  const handleRowClick = useCallback(
    (parent: ParentListItem) => {
      // Route parents to the existing admin users view when a dedicated detail page is absent.
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "25");
      params.set("sortField", "name");
      params.set("sortDir", "asc");
      params.set("search", parent.email);
      params.set("filters", JSON.stringify({ role: "Parent" }));
      router.push(`/${tenant}/admin/users?${params.toString()}`);
    },
    [router, tenant],
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="parents-list-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
      />

      {listError ? (
        <AdminErrorPanel onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}

      {!listError ? (
        <>
          <AdminDataTable<ParentListItem>
            columns={columns}
            rows={parents}
            rowKey={(parent) => `parent-row-${parent.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={handleRowClick}
            testId="parents-table"
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
          label={t("admin.parentsList.filters.hasStudents.label")}
          htmlFor="parents-filter-has-students"
        >
          <select
            id="parents-filter-has-students"
            className="rounded border border-slate-300 px-3 py-2"
            value={
              typeof state.filters.hasStudents === "boolean"
                ? state.filters.hasStudents
                  ? "YES"
                  : "NO"
                : "ALL"
            }
            onChange={(event) => {
              const value = event.target.value as HasStudentsFilter;
              if (value === "YES") {
                setFilter("hasStudents", true);
              } else if (value === "NO") {
                setFilter("hasStudents", false);
              } else {
                setFilter("hasStudents", null);
              }
            }}
          >
            <option value="ALL">
              {t("admin.parentsList.filters.hasStudents.any")}
            </option>
            <option value="YES">
              {t("admin.parentsList.filters.hasStudents.yes")}
            </option>
            <option value="NO">
              {t("admin.parentsList.filters.hasStudents.no")}
            </option>
          </select>
        </AdminFormField>
      </AdminFiltersSheet>
    </div>
  );
}
