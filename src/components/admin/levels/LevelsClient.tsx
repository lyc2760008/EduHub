// Client-side levels admin UI with shared table toolkit + create/edit drawers.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type LevelRecord = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type LevelsResponse = {
  rows: LevelRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type LevelsClientProps = {
  tenant: string;
};

type LevelFormState = {
  id: string | null;
  name: string;
  sortOrder: string;
};

const emptyForm: LevelFormState = {
  id: null,
  name: "",
  sortOrder: "0",
};

function toFormState(level: LevelRecord): LevelFormState {
  return {
    id: level.id,
    name: level.name,
    sortOrder: String(level.sortOrder ?? 0),
  };
}

function formatDate(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

export default function LevelsClient({ tenant }: LevelsClientProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const [levels, setLevels] = useState<LevelRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState<LevelFormState>(emptyForm);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [hasDefaulted, setHasDefaulted] = useState(false);

  const isEditing = Boolean(form.id);

  const { state, setSearch, setFilter, setSort, setPage, setPageSize, resetAll } =
    useAdminTableQueryState({
      defaultSortField: "name",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["isActive"],
    });

  useEffect(() => {
    if (hasDefaulted) return;
    if (typeof state.filters.isActive !== "boolean") {
      setFilter("isActive", true);
    }
    setHasDefaulted(true);
  }, [hasDefaulted, setFilter, state.filters.isActive]);

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const loadLevels = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps level list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<LevelsResponse>(
        buildTenantApiUrl(tenant, `/levels?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.levels.messages.forbidden"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load levels", result.details);
        setListError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setListError(t("admin.levels.messages.loadError"));
        return false;
      }

      setLevels(result.data.rows);
      setTotalCount(result.data.totalCount);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadLevels();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadLevels, reloadNonce]);

  const openCreateModal = () => {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setFormError(null);
    setMessage(null);
  };

  const openEditModal = useCallback((level: LevelRecord) => {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(level));
    setIsModalOpen(true);
    setFormError(null);
    setMessage(null);
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);
    setMessage(null);

    const trimmedName = form.name.trim();
    const sortOrderValue = form.sortOrder.trim();
    const parsedSortOrder = Number.parseInt(sortOrderValue, 10);

    if (!trimmedName || Number.isNaN(parsedSortOrder)) {
      setFormError(t("admin.levels.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const payload = { name: trimmedName, sortOrder: parsedSortOrder };
    const url = isEditing
      ? buildTenantApiUrl(tenant, `/levels/${form.id}`)
      : buildTenantApiUrl(tenant, "/levels");
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<LevelRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setFormError(t("admin.levels.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setFormError(
        isValidation
          ? t("admin.levels.messages.validationError")
          : t("admin.levels.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await loadLevels();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
    setMessage(
      isEditing
        ? t("admin.levels.messages.updateSuccess")
        : t("admin.levels.messages.createSuccess"),
    );
  }

  const toggleActive = useCallback(
    async (level: LevelRecord) => {
      setIsSaving(true);
      setListError(null);
      setMessage(null);

      const result = await fetchJson<LevelRecord>(
        buildTenantApiUrl(tenant, `/levels/${level.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !level.isActive }),
        },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.levels.messages.forbidden"));
        setIsSaving(false);
        return;
      }

      if (!result.ok) {
        setListError(t("admin.levels.messages.loadError"));
        setIsSaving(false);
        return;
      }

      await loadLevels();
      setMessage(t("admin.levels.messages.updateSuccess"));
      setIsSaving(false);
    },
    [loadLevels, t, tenant],
  );

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    if (typeof state.filters.isActive === "boolean") {
      chips.push({
        key: "isActive",
        label: t("admin.levels.fields.status"),
        value: state.filters.isActive
          ? t("common.status.active")
          : t("common.status.inactive"),
        onRemove: () => setFilter("isActive", null),
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
  }, [setFilter, setSearch, state.filters.isActive, state.search, t]);

  const clearAll = () => {
    setSearchInput("");
    resetAll({ sortField: "name", sortDir: "asc" });
  };

  const columns: AdminDataTableColumn<LevelRecord>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("admin.levels.fields.name"),
        sortable: true,
        sortField: "name",
        renderCell: (level) => (
          <span className="font-medium text-slate-900">{level.name}</span>
        ),
      },
      {
        key: "sortOrder",
        label: t("admin.levels.fields.sortOrder"),
        sortable: true,
        sortField: "sortOrder",
        renderCell: (level) => level.sortOrder,
      },
      {
        key: "status",
        label: t("admin.levels.fields.status"),
        renderCell: (level) =>
          level.isActive
            ? t("common.status.active")
            : t("common.status.inactive"),
      },
      {
        key: "updatedAt",
        label: t("admin.levels.fields.updatedAt"),
        renderCell: (level) => formatDate(level.updatedAt, locale),
      },
      {
        key: "actions",
        label: t("admin.levels.fields.actions"),
        renderCell: (level) => (
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => openEditModal(level)}
              type="button"
            >
              {t("admin.levels.edit")}
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => toggleActive(level)}
              type="button"
            >
              {level.isActive
                ? t("common.actions.deactivate")
                : t("common.actions.activate")}
            </button>
          </div>
        ),
      },
    ],
    [isSaving, locale, openEditModal, t, toggleActive],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.levelsList.empty.title"),
      body: t("admin.levelsList.empty.body"),
    }),
    [t],
  );

  const rightSlot = (
    <button
      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      data-testid="create-level-button"
      onClick={openCreateModal}
      type="button"
    >
      {t("admin.levelsList.action.create")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="levels-list-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
        rightSlot={rightSlot}
      />

      {listError ? (
        <AdminErrorPanel onRetry={() => setReloadNonce((value) => value + 1)} />
      ) : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      {!listError ? (
        <>
          <AdminDataTable<LevelRecord>
            columns={columns}
            rows={levels}
            rowKey={(level) => `level-row-${level.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={openEditModal}
            testId="levels-table"
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
          label={t("admin.levels.fields.status")}
          htmlFor="levels-filter-status"
        >
          <select
            id="levels-filter-status"
            className="rounded border border-slate-300 px-3 py-2"
            value={
              typeof state.filters.isActive === "boolean"
                ? state.filters.isActive
                  ? "ACTIVE"
                  : "INACTIVE"
                : "ALL"
            }
            onChange={(event) => {
              const value = event.target.value;
              if (value === "ACTIVE") {
                setFilter("isActive", true);
              } else if (value === "INACTIVE") {
                setFilter("isActive", false);
              } else {
                setFilter("isActive", null);
              }
            }}
          >
            <option value="ALL">{t("admin.reports.statusFilter.all")}</option>
            <option value="ACTIVE">
              {t("admin.reports.statusFilter.active")}
            </option>
            <option value="INACTIVE">
              {t("admin.reports.statusFilter.inactive")}
            </option>
          </select>
        </AdminFormField>
      </AdminFiltersSheet>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isEditing ? t("admin.levels.edit") : t("admin.levels.create")}
              </h2>
              <button
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                disabled={isSaving}
                onClick={closeModal}
                type="button"
              >
                {t("common.actions.cancel")}
              </button>
            </div>
            <form className="mt-4 grid gap-4" noValidate onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.levels.fields.name")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="level-name-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.levels.fields.sortOrder")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="level-sort-order-input"
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      sortOrder: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="save-level-button"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? t("common.loading") : t("common.actions.save")}
                </button>
                <button
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  disabled={isSaving}
                  onClick={closeModal}
                  type="button"
                >
                  {t("common.actions.cancel")}
                </button>
              </div>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
