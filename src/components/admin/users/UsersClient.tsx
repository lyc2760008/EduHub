// Client-side users admin UI serves as the staff list for Step 21.4B.
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

type RoleValue = "Owner" | "Admin" | "Tutor" | "Parent" | "Student";

type CenterOption = {
  id: string;
  name: string;
};

type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  role: RoleValue;
  centers: CenterOption[];
};

type UsersResponse = {
  rows: UserListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type UsersClientProps = {
  centers: CenterOption[];
  tenant: string;
};

type UserFormState = {
  id: string | null;
  email: string;
  name: string;
  role: RoleValue;
  centerIds: string[];
};

const ROLE_OPTIONS: RoleValue[] = ["Owner", "Admin", "Tutor"];

const emptyForm: UserFormState = {
  id: null,
  email: "",
  name: "",
  role: "Tutor",
  centerIds: [],
};

function roleTranslationKey(role: RoleValue) {
  return `admin.users.roles.${role.toLowerCase()}` as const;
}

function toFormState(user: UserListItem): UserFormState {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    role: user.role,
    centerIds: user.centers.map((center) => center.id),
  };
}

export default function UsersClient({
  centers,
  tenant,
}: UsersClientProps) {
  const t = useTranslations();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const isEditing = Boolean(form.id);

  const { state, setSearch, setFilter, setSort, setPage, setPageSize, resetAll } =
    useAdminTableQueryState({
      defaultSortField: "name",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["role"],
    });

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const refreshUsers = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps user list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const result = await fetchJson<UsersResponse>(
        buildTenantApiUrl(tenant, `/users?${params.toString()}`),
        { cache: "no-store" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.users.messages.forbidden"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        // Network failures fall back to a generic localized error message.
        console.error("Failed to load users", result.details);
        setListError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setListError(t("admin.users.messages.loadError"));
        return false;
      }

      setUsers(result.data.rows);
      setTotalCount(result.data.totalCount);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void refreshUsers();
    }, 0);
    return () => clearTimeout(handle);
  }, [refreshUsers, reloadNonce]);

  const openCreateModal = useCallback(() => {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setListError(null);
    setFormError(null);
    setMessage(null);
  }, []);

  const openEditModal = useCallback((user: UserListItem) => {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(user));
    setIsModalOpen(true);
    setListError(null);
    setFormError(null);
    setMessage(null);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setFormError(null);
  }, []);

  function toggleCenter(centerId: string) {
    setForm((prev) => {
      const selected = new Set(prev.centerIds);
      if (selected.has(centerId)) {
        selected.delete(centerId);
      } else {
        selected.add(centerId);
      }
      return { ...prev, centerIds: Array.from(selected) };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setListError(null);
    setFormError(null);
    setMessage(null);

    const trimmedEmail = form.email.trim();
    const trimmedName = form.name.trim();

    if (!isEditing && !trimmedEmail) {
      setFormError(t("admin.users.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const payload: {
      email?: string;
      name?: string;
      role: RoleValue;
      centerIds: string[];
    } = {
      role: form.role,
      centerIds: form.centerIds,
    };

    if (!isEditing) {
      payload.email = trimmedEmail;
    }

    if (trimmedName) {
      payload.name = trimmedName;
    }

    const url = isEditing
      ? buildTenantApiUrl(tenant, `/users/${form.id}`)
      : buildTenantApiUrl(tenant, "/users");
    const method = isEditing ? "PATCH" : "POST";

    const result = await fetchJson<UserListItem>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setFormError(t("admin.users.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setFormError(
        isValidation
          ? t("admin.users.messages.validationError")
          : t("admin.users.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshUsers();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
    setMessage(
      isEditing
        ? t("admin.users.messages.updateSuccess")
        : t("admin.users.messages.createSuccess"),
    );
  }

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const role = typeof state.filters.role === "string" ? state.filters.role : "";
    if (role) {
      chips.push({
        key: "role",
        label: t("admin.users.fields.role"),
        value: t(roleTranslationKey(role as RoleValue)),
        onRemove: () => setFilter("role", ""),
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
  }, [setFilter, setSearch, state.filters.role, state.search, t]);

  const clearAll = () => {
    setSearchInput("");
    resetAll({ sortField: "name", sortDir: "asc" });
  };

  const columns: AdminDataTableColumn<UserListItem>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("admin.users.fields.name"),
        sortable: true,
        sortField: "name",
        renderCell: (user) => (
          <span className="font-medium text-slate-900">{user.name ?? ""}</span>
        ),
      },
      {
        key: "email",
        label: t("admin.users.fields.email"),
        sortable: true,
        sortField: "email",
        renderCell: (user) => user.email,
      },
      {
        key: "role",
        label: t("admin.users.fields.role"),
        sortable: true,
        sortField: "role",
        renderCell: (user) => t(roleTranslationKey(user.role)),
      },
      {
        key: "centers",
        label: t("admin.users.fields.centers"),
        renderCell: (user) => user.centers.map((center) => center.name).join(", "),
      },
      {
        key: "actions",
        label: t("admin.users.edit"),
        renderCell: (user) => (
          <button
            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
            // Test hooks keep row-level actions stable for Playwright selectors.
            data-testid="edit-user-button"
            data-user-email={user.email}
            disabled={isSaving}
            onClick={() => openEditModal(user)}
            type="button"
          >
            {t("admin.users.edit")}
          </button>
        ),
      },
    ],
    [isSaving, openEditModal, t],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.staffList.empty.title"),
      body: t("admin.staffList.empty.body"),
    }),
    [t],
  );

  const rightSlot = (
    <button
      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      data-testid="create-user-button"
      onClick={openCreateModal}
      type="button"
    >
      {t("admin.staffList.action.create")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="users-list-search"
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
          <AdminDataTable<UserListItem>
            columns={columns}
            rows={users}
            rowKey={(user) => `user-row-${user.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            onRowClick={openEditModal}
            testId="users-table"
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
        <AdminFormField label={t("admin.users.fields.role")} htmlFor="users-filter-role">
          <select
            id="users-filter-role"
            className="rounded border border-slate-300 px-3 py-2"
            value={typeof state.filters.role === "string" ? state.filters.role : ""}
            onChange={(event) => setFilter("role", event.target.value)}
          >
            <option value="">{t("admin.reports.statusFilter.all")}</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {t(roleTranslationKey(role))}
              </option>
            ))}
          </select>
        </AdminFormField>
      </AdminFiltersSheet>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isEditing ? t("admin.users.edit") : t("admin.users.create")}
              </h2>
              <button
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                disabled={isSaving}
                onClick={closeModal}
                type="button"
              >
                {t("admin.users.actions.cancel")}
              </button>
            </div>
            <form
              className="mt-4 grid gap-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.users.fields.email")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  data-testid="user-email-input"
                  disabled={isEditing}
                  value={form.email}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.users.fields.name")}
                </span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="user-name-input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.users.fields.role")}
                </span>
                <select
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="user-roles-select"
                  value={form.role}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      role: event.target.value as RoleValue,
                    }))
                  }
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {t(roleTranslationKey(role))}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset
                className="flex flex-col gap-2 text-sm"
                data-testid="user-centers-select"
              >
                <legend className="text-slate-700">
                  {t("admin.users.fields.centers")}
                </legend>
                <div className="grid gap-2">
                  {centers.map((center) => (
                    <label key={center.id} className="flex items-center gap-2">
                      <input
                        checked={form.centerIds.includes(center.id)}
                        className="h-4 w-4 rounded border-slate-300"
                        onChange={() => toggleCenter(center.id)}
                        type="checkbox"
                      />
                      <span className="text-slate-700">{center.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="save-user-button"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving
                    ? t("common.loading")
                    : t("admin.users.actions.save")}
                </button>
                <button
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  disabled={isSaving}
                  onClick={closeModal}
                  type="button"
                >
                  {t("admin.users.actions.cancel")}
                </button>
              </div>
              {formError ? (
                <p className="text-sm text-red-600">{formError}</p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
