// Client-side programs admin UI with shared table toolkit + create/edit drawers.
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
};

type ProgramRecord = {
  id: string;
  name: string;
  subjectId: string | null;
  levelId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProgramsResponse = {
  rows: ProgramRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type SubjectsResponse = {
  rows: SubjectRecord[];
  totalCount: number;
};

type ProgramsClientProps = {
  tenant: string;
};

type ProgramFormState = {
  id: string | null;
  name: string;
  subjectId: string;
};

const emptyForm: ProgramFormState = {
  id: null,
  name: "",
  subjectId: "",
};

function toFormState(program: ProgramRecord): ProgramFormState {
  return {
    id: program.id,
    name: program.name,
    subjectId: program.subjectId ?? "",
  };
}

function formatDate(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed);
}

export default function ProgramsClient({ tenant }: ProgramsClientProps) {
  const t = useTranslations();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState<ProgramFormState>(emptyForm);
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

  const loadPrograms = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps program list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<ProgramsResponse>(
        buildTenantApiUrl(tenant, `/programs?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.programs.messages.forbidden"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load programs", result.details);
        setListError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setListError(t("admin.programs.messages.loadError"));
        return false;
      }

      setPrograms(result.data.rows);
      setTotalCount(result.data.totalCount);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  const loadSubjects = useCallback(async () => {
    const result = await fetchJson<SubjectsResponse>(
      buildTenantApiUrl(
        tenant,
        `/subjects?${new URLSearchParams({
          page: "1",
          pageSize: "100",
          sortField: "name",
          sortDir: "asc",
        }).toString()}`,
      ),
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setListError(t("admin.programs.messages.forbidden"));
      return false;
    }

    if (!result.ok && result.status === 0) {
      console.error("Failed to load program subjects", result.details);
      setListError(t("common.error"));
      return false;
    }

    if (!result.ok) {
      setListError(t("admin.programs.messages.loadError"));
      return false;
    }

    setSubjects(result.data.rows);
    return true;
  }, [t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadPrograms();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadPrograms, reloadNonce]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const subjectLookup = useMemo(() => {
    return new Map(subjects.map((subject) => [subject.id, subject.name]));
  }, [subjects]);

  const openCreateModal = () => {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setFormError(null);
    setMessage(null);
  };

  const openEditModal = useCallback((program: ProgramRecord) => {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(program));
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
      setFormError(t("admin.programs.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const subjectIdValue = form.subjectId.trim();
    const payload = {
      name: trimmedName,
      subjectId: subjectIdValue.length ? subjectIdValue : null,
    };

    const url = isEditing
      ? buildTenantApiUrl(tenant, `/programs/${form.id}`)
      : buildTenantApiUrl(tenant, "/programs");
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<ProgramRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setFormError(t("admin.programs.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setFormError(
        isValidation
          ? t("admin.programs.messages.validationError")
          : t("admin.programs.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await loadPrograms();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
    setMessage(
      isEditing
        ? t("admin.programs.messages.updateSuccess")
        : t("admin.programs.messages.createSuccess"),
    );
  }

  const toggleActive = useCallback(
    async (program: ProgramRecord) => {
      setIsSaving(true);
      setListError(null);
      setMessage(null);

      const result = await fetchJson<ProgramRecord>(
        buildTenantApiUrl(tenant, `/programs/${program.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !program.isActive }),
        },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.programs.messages.forbidden"));
        setIsSaving(false);
        return;
      }

      if (!result.ok) {
        setListError(t("admin.programs.messages.loadError"));
        setIsSaving(false);
        return;
      }

      await loadPrograms();
      setMessage(t("admin.programs.messages.updateSuccess"));
      setIsSaving(false);
    },
    [loadPrograms, t, tenant],
  );

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    if (typeof state.filters.isActive === "boolean") {
      chips.push({
        key: "isActive",
        label: t("admin.programs.fields.status"),
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

  const columns: AdminDataTableColumn<ProgramRecord>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("admin.programs.fields.name"),
        sortable: true,
        sortField: "name",
        renderCell: (program) => (
          <span className="font-medium text-slate-900">{program.name}</span>
        ),
      },
      {
        key: "subjectId",
        label: t("admin.programs.fields.subject"),
        renderCell: (program) =>
          program.subjectId
            ? subjectLookup.get(program.subjectId) ??
              t("admin.programs.messages.noSubject")
            : t("admin.programs.messages.noSubject"),
      },
      {
        key: "status",
        label: t("admin.programs.fields.status"),
        renderCell: (program) =>
          program.isActive
            ? t("common.status.active")
            : t("common.status.inactive"),
      },
      {
        key: "updatedAt",
        label: t("admin.programs.fields.updatedAt"),
        renderCell: (program) => formatDate(program.updatedAt, locale),
      },
      {
        key: "actions",
        label: t("admin.programs.fields.actions"),
        renderCell: (program) => (
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => openEditModal(program)}
              type="button"
            >
              {t("admin.programs.edit")}
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => toggleActive(program)}
              type="button"
            >
              {program.isActive
                ? t("common.actions.deactivate")
                : t("common.actions.activate")}
            </button>
          </div>
        ),
      },
    ],
    [isSaving, locale, openEditModal, subjectLookup, t, toggleActive],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.programsList.empty.title"),
      body: t("admin.programsList.empty.body"),
    }),
    [t],
  );

  const rightSlot = (
    <button
      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      data-testid="create-program-button"
      onClick={openCreateModal}
      type="button"
    >
      {t("admin.programsList.action.create")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="programs-list-search"
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
          <AdminDataTable<ProgramRecord>
            columns={columns}
            rows={programs}
            rowKey={(program) => `program-row-${program.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={openEditModal}
            testId="programs-table"
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
          label={t("admin.programs.fields.status")}
          htmlFor="programs-filter-status"
        >
          <select
            id="programs-filter-status"
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
                  ? t("admin.programs.edit")
                  : t("admin.programs.create")}
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
                  {t("admin.programs.fields.name")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="program-name-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.programs.fields.subject")}
                </span>
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="program-subject-select"
                  value={form.subjectId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      subjectId: event.target.value,
                    }))
                  }
                >
                  <option value="">{t("admin.programs.messages.noSubject")}</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="save-program-button"
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
