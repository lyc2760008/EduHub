// Students admin list uses shared table toolkit primitives while preserving existing create/edit flows.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { StudentStatus } from "@/generated/prisma/client";
import AdminDataTable, {
  type AdminDataTableColumn,
} from "@/components/admin/shared/AdminDataTable";
import AdminFiltersSheet from "@/components/admin/shared/AdminFiltersSheet";
import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminModalShell from "@/components/admin/shared/AdminModalShell";
import AdminPagination from "@/components/admin/shared/AdminPagination";
import AdminTableToolbar, {
  type AdminFilterChip,
} from "@/components/admin/shared/AdminTableToolbar";
import {
  AdminErrorPanel,
  type AdminEmptyState,
} from "@/components/admin/shared/AdminTableStatePanels";
import { inputBase, primaryButton, secondaryButton } from "@/components/admin/shared/adminUiClasses";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  useAdminTableQueryState,
  useDebouncedValue,
} from "@/lib/admin-table/useAdminTableQueryState";

type StudentStatusValue = StudentStatus;

type StudentListItem = {
  id: string;
  firstName: string;
  lastName: string;
  grade?: string | null;
  level?: { id: string; name: string } | null;
  parentCount: number;
  status: StudentStatusValue;
};

type LevelOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

type StudentsResponse = {
  students: StudentListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type StudentsClientProps = {
  tenant: string;
};

type StudentFormState = {
  firstName: string;
  lastName: string;
  levelId: string;
  grade: string;
};

const emptyForm: StudentFormState = {
  firstName: "",
  lastName: "",
  levelId: "",
  grade: "",
};

function formatStudentName(student: StudentListItem) {
  return `${student.firstName} ${student.lastName}`.trim();
}

function normalizeStatusFilter(value: unknown) {
  if (typeof value !== "string") return "ALL";
  if (value === "ACTIVE" || value === "INACTIVE" || value === "ARCHIVED") return value;
  return "ALL";
}

export default function StudentsClient({ tenant }: StudentsClientProps) {
  const t = useTranslations();
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState<StudentFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const { state, setSearch, setFilter, clearFilters, setSort, setPage, setPageSize } =
    useAdminTableQueryState({
      defaultSortField: "name",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["status"],
    });

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const refreshStudents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(state.page),
      pageSize: String(state.pageSize),
    });
    // Pass sort to the API so ordering happens before pagination boundaries.
    if (state.sortField) {
      params.set("sortField", state.sortField);
      params.set("sortDir", state.sortDir);
    }
    if (state.search.trim()) {
      params.set("q", state.search.trim());
    }
    const status = normalizeStatusFilter(state.filters.status);
    if (status !== "ALL") {
      params.set("status", status);
    }

    try {
      const result = await fetchJson<StudentsResponse>(
        buildTenantApiUrl(tenant, `/students?${params.toString()}`),
        // Student lists are mutable; bypass browser caching to avoid stale page boundaries after creates.
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setError(t("admin.students.messages.error"));
        return;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load students", result.details);
        setError(t("common.error"));
        return;
      }

      if (!result.ok) {
        setError(t("admin.students.messages.error"));
        return;
      }

      setStudents(result.data.students);
      setTotalCount(result.data.total);
    } finally {
      setIsLoading(false);
    }
  }, [
    state.filters.status,
    state.page,
    state.pageSize,
    state.search,
    state.sortDir,
    state.sortField,
    t,
    tenant,
  ]);

  const refreshLevels = useCallback(async () => {
    const result = await fetchJson<LevelOption[]>(
      buildTenantApiUrl(tenant, "/levels"),
      // Keep level options fresh when admins add/edit catalog data in other tabs.
      { cache: "no-store" },
    );
    if (result.ok) {
      setLevels(result.data);
    } else {
      setLevels([]);
    }
  }, [tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void refreshStudents();
    }, 0);
    return () => clearTimeout(handle);
  }, [refreshStudents, reloadNonce]);

  useEffect(() => {
    void refreshLevels();
  }, [refreshLevels]);

  function openCreateModal() {
    setForm(emptyForm);
    setIsModalOpen(true);
    setError(null);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const trimmedFirstName = form.firstName.trim();
    const trimmedLastName = form.lastName.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      setError(t("admin.students.messages.error"));
      setIsSaving(false);
      return;
    }

    const payload: {
      firstName: string;
      lastName: string;
      levelId?: string;
      grade?: string;
    } = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
    };

    if (form.levelId) {
      payload.levelId = form.levelId;
    }
    if (form.grade.trim()) {
      payload.grade = form.grade.trim();
    }

    const result = await fetchJson<{ student: StudentListItem }>(
      buildTenantApiUrl(tenant, "/students"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok) {
      setError(
        result.status === 0 ? t("common.error") : t("admin.students.messages.error"),
      );
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    setIsModalOpen(false);
    setReloadNonce((current) => current + 1);
  }

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const status = normalizeStatusFilter(state.filters.status);
    if (status !== "ALL") {
      const statusKey = status === "ACTIVE" ? "admin.students.status.active" : "admin.students.status.inactive";
      chips.push({
        key: "status",
        label: t("admin.students.table.status"),
        value: t(statusKey),
        onRemove: () => setFilter("status", "ALL"),
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
  }, [setFilter, setSearch, state.filters.status, state.search, t]);

  const clearAll = () => {
    clearFilters();
    setSearch("");
    setSearchInput("");
  };

  const columns: AdminDataTableColumn<StudentListItem>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("admin.students.table.name"),
        sortable: true,
        sortField: "name",
        renderCell: (student) => (
          <span className="font-medium text-slate-900">{formatStudentName(student)}</span>
        ),
      },
      {
        key: "level",
        label: t("admin.students.table.level"),
        renderCell: (student) => student.level?.name ?? t("generic.dash"),
      },
      {
        key: "grade",
        label: t("admin.students.table.grade"),
        renderCell: (student) => student.grade ?? t("generic.dash"),
      },
      {
        key: "parentCount",
        label: t("admin.students.table.parentCount"),
        sortable: true,
        sortField: "parentCount",
        renderCell: (student) => student.parentCount,
      },
      {
        key: "status",
        label: t("admin.students.table.status"),
        sortable: true,
        sortField: "status",
        renderCell: (student) =>
          student.status === "ACTIVE"
            ? t("admin.students.status.active")
            : t("admin.students.status.inactive"),
      },
      {
        key: "actions",
        label: t("admin.students.table.actions"),
        renderCell: (student) => (
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              data-testid={`students-row-${student.id}-open`}
              href={`/${tenant}/admin/students/${student.id}?mode=view`}
            >
              {t("admin.students.actions.view")}
            </Link>
            <Link
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              href={`/${tenant}/admin/students/${student.id}?mode=edit`}
            >
              {t("admin.students.actions.edit")}
            </Link>
          </div>
        ),
      },
    ],
    [t, tenant],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.students.messages.empty"),
      body: t("admin.reports.students.empty.body"),
    }),
    [t],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className={primaryButton}
          data-testid="create-student-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.students.actions.create")}
        </button>
      </div>

      <AdminTableToolbar
        searchId="students-list-search"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        filterChips={filterChips}
        onClearAllFilters={clearAll}
      />

      {error ? <AdminErrorPanel onRetry={() => setReloadNonce((current) => current + 1)} /> : null}

      {!error ? (
        <>
          <AdminDataTable<StudentListItem>
            columns={columns}
            rows={students}
            rowKey={(student) => `students-row-${student.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            testId="students-table"
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
        <AdminFormField label={t("admin.students.table.status")} htmlFor="students-status-filter">
          <select
            id="students-status-filter"
            className={inputBase}
            value={normalizeStatusFilter(state.filters.status)}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="ALL">{t("admin.reports.statusFilter.all")}</option>
            <option value="ACTIVE">{t("admin.students.status.active")}</option>
            <option value="INACTIVE">{t("admin.students.status.inactive")}</option>
          </select>
        </AdminFormField>
      </AdminFiltersSheet>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded border border-slate-200 bg-white p-6 shadow-xl">
            <form noValidate onSubmit={handleCreate}>
              <AdminModalShell
                title={t("admin.students.actions.create")}
                footer={
                  <>
                    <button
                      className={secondaryButton}
                      disabled={isSaving}
                      onClick={closeModal}
                      type="button"
                    >
                      {t("common.actions.cancel")}
                    </button>
                    <button
                      className={primaryButton}
                      data-testid="save-student-button"
                      disabled={isSaving}
                      type="submit"
                    >
                      {isSaving
                        ? t("admin.students.detail.saving")
                        : t("common.actions.save")}
                    </button>
                  </>
                }
                testId="student-create-modal"
              >
                <AdminFormField
                  label={t("admin.students.fields.firstName")}
                  htmlFor="student-create-first-name"
                  required
                >
                  <input
                    className={inputBase}
                    data-testid="student-first-name-input"
                    id="student-create-first-name"
                    value={form.firstName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, firstName: event.target.value }))
                    }
                  />
                </AdminFormField>
                <AdminFormField
                  label={t("admin.students.fields.lastName")}
                  htmlFor="student-create-last-name"
                  required
                >
                  <input
                    className={inputBase}
                    data-testid="student-last-name-input"
                    id="student-create-last-name"
                    value={form.lastName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, lastName: event.target.value }))
                    }
                  />
                </AdminFormField>
                <AdminFormField
                  label={t("admin.students.fields.level")}
                  htmlFor="student-create-level"
                >
                  <select
                    className={inputBase}
                    data-testid="student-level-select"
                    id="student-create-level"
                    value={form.levelId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, levelId: event.target.value }))
                    }
                  >
                    <option value="">
                      {t("admin.students.fields.levelPlaceholder")}
                    </option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </AdminFormField>
                <AdminFormField
                  label={t("admin.students.fields.grade")}
                  htmlFor="student-create-grade"
                >
                  <input
                    className={inputBase}
                    id="student-create-grade"
                    data-testid="student-grade-input"
                    value={form.grade}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, grade: event.target.value }))
                    }
                  />
                </AdminFormField>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </AdminModalShell>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
