// Client-side subjects admin UI with shared table toolkit + create/edit drawers.
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

type SubjectRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SubjectsResponse = {
  rows: SubjectRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type SubjectsClientProps = {
  tenant: string;
};

type SubjectFormState = {
  id: string | null;
  name: string;
};

const emptyForm: SubjectFormState = {
  id: null,
  name: "",
};

function toFormState(subject: SubjectRecord): SubjectFormState {
  return {
    id: subject.id,
    name: subject.name,
  };
}

function formatDate(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

export default function SubjectsClient({ tenant }: SubjectsClientProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState<SubjectFormState>(emptyForm);
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

  const loadSubjects = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps subject list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<SubjectsResponse>(
        buildTenantApiUrl(tenant, `/subjects?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.subjects.messages.forbidden"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load subjects", result.details);
        setListError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setListError(t("admin.subjects.messages.loadError"));
        return false;
      }

      setSubjects(result.data.rows);
      setTotalCount(result.data.totalCount);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSubjects();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSubjects, reloadNonce]);

  const openCreateModal = () => {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setFormError(null);
    setMessage(null);
  };

  const openEditModal = useCallback((subject: SubjectRecord) => {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(subject));
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
    if (!trimmedName) {
      setFormError(t("admin.subjects.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const payload = { name: trimmedName };
    const url = isEditing
      ? buildTenantApiUrl(tenant, `/subjects/${form.id}`)
      : buildTenantApiUrl(tenant, "/subjects");
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<SubjectRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setFormError(t("admin.subjects.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setFormError(
        isValidation
          ? t("admin.subjects.messages.validationError")
          : t("admin.subjects.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await loadSubjects();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
    setMessage(
      isEditing
        ? t("admin.subjects.messages.updateSuccess")
        : t("admin.subjects.messages.createSuccess"),
    );
  }

  const toggleActive = useCallback(
    async (subject: SubjectRecord) => {
      setIsSaving(true);
      setListError(null);
      setMessage(null);

      const result = await fetchJson<SubjectRecord>(
        buildTenantApiUrl(tenant, `/subjects/${subject.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !subject.isActive }),
        },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.subjects.messages.forbidden"));
        setIsSaving(false);
        return;
      }

      if (!result.ok) {
        setListError(t("admin.subjects.messages.loadError"));
        setIsSaving(false);
        return;
      }

      await loadSubjects();
      setMessage(t("admin.subjects.messages.updateSuccess"));
      setIsSaving(false);
    },
    [loadSubjects, t, tenant],
  );

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    if (typeof state.filters.isActive === "boolean") {
      chips.push({
        key: "isActive",
        label: t("admin.subjects.fields.status"),
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

  const columns: AdminDataTableColumn<SubjectRecord>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("admin.subjects.fields.name"),
        sortable: true,
        sortField: "name",
        renderCell: (subject) => (
          <span className="font-medium text-slate-900">{subject.name}</span>
        ),
      },
      {
        key: "status",
        label: t("admin.subjects.fields.status"),
        renderCell: (subject) =>
          subject.isActive
            ? t("common.status.active")
            : t("common.status.inactive"),
      },
      {
        key: "updatedAt",
        label: t("admin.subjects.fields.updatedAt"),
        renderCell: (subject) => formatDate(subject.updatedAt, locale),
      },
      {
        key: "actions",
        label: t("admin.subjects.fields.actions"),
        renderCell: (subject) => (
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => openEditModal(subject)}
              type="button"
            >
              {t("admin.subjects.edit")}
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => toggleActive(subject)}
              type="button"
            >
              {subject.isActive
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
      title: t("admin.subjectsList.empty.title"),
      body: t("admin.subjectsList.empty.body"),
    }),
    [t],
  );

  const rightSlot = (
    <button
      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      data-testid="create-subject-button"
      onClick={openCreateModal}
      type="button"
    >
      {t("admin.subjectsList.action.create")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="subjects-list-search"
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
          <AdminDataTable<SubjectRecord>
            columns={columns}
            rows={subjects}
            rowKey={(subject) => `subject-row-${subject.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={openEditModal}
            testId="subjects-table"
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
          label={t("admin.subjects.fields.status")}
          htmlFor="subjects-filter-status"
        >
          <select
            id="subjects-filter-status"
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
                {isEditing
                  ? t("admin.subjects.edit")
                  : t("admin.subjects.create")}
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
                  {t("admin.subjects.fields.name")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="subject-name-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="save-subject-button"
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
