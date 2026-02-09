// Client-side groups admin UI with modal create/edit and active toggles.
// RBAC + tenant scoping are enforced server-side; this client focuses on UX state.
// fetchJson keeps API error shapes predictable; AdminDataTable keeps layout consistent.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

type GroupTypeValue = "GROUP" | "CLASS";

type GroupListItem = {
  id: string;
  name: string;
  type: GroupTypeValue;
  centerId: string;
  centerName: string;
  programId: string;
  programName: string;
  levelId: string | null;
  levelName: string | null;
  isActive: boolean;
  capacity: number | null;
  notes: string | null;
  tutorsCount: number;
  studentsCount: number;
};

type GroupsResponse = {
  rows: GroupListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  sort: { field: string | null; dir: "asc" | "desc" };
  appliedFilters: Record<string, unknown>;
};

type CenterOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type ProgramOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type LevelOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type ProgramOptionsResponse = {
  rows: ProgramOption[];
  totalCount: number;
};

type LevelOptionsResponse = {
  rows: LevelOption[];
  totalCount: number;
};

type TutorOption = {
  id: string;
  name: string | null;
  email: string;
};

type TutorsResponse = {
  rows: TutorOption[];
  totalCount: number;
};

type GroupsClientProps = {
  centers: CenterOption[];
  programs: ProgramOption[];
  levels: LevelOption[];
  tenant: string;
};

type GroupFormState = {
  id: string | null;
  name: string;
  type: GroupTypeValue;
  centerId: string;
  programId: string;
  levelId: string;
  capacity: string;
  notes: string;
};

const GROUP_TYPE_OPTIONS: GroupTypeValue[] = ["GROUP", "CLASS"];

const emptyForm: GroupFormState = {
  id: null,
  name: "",
  type: "GROUP",
  centerId: "",
  programId: "",
  levelId: "",
  capacity: "",
  notes: "",
};

function toFormState(group: GroupListItem): GroupFormState {
  return {
    id: group.id,
    name: group.name,
    type: group.type,
    centerId: group.centerId,
    programId: group.programId,
    levelId: group.levelId ?? "",
    capacity: group.capacity !== null ? String(group.capacity) : "",
    notes: group.notes ?? "",
  };
}

export default function GroupsClient({
  centers: initialCenters,
  programs: initialPrograms,
  levels: initialLevels,
  tenant,
}: GroupsClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [centers, setCenters] = useState<CenterOption[]>(initialCenters);
  const [programs, setPrograms] = useState<ProgramOption[]>(initialPrograms);
  const [levels, setLevels] = useState<LevelOption[]>(initialLevels);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState<GroupFormState>(emptyForm);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const isEditing = Boolean(form.id);

  const groupTypeLabels = useMemo(() => {
    return {
      GROUP: t("admin.groups.types.group"),
      CLASS: t("admin.groups.types.class"),
    };
  }, [t]);

  const { state, setSearch, setFilter, setSort, setPage, setPageSize, resetAll } =
    useAdminTableQueryState({
      defaultSortField: "name",
      defaultSortDir: "asc",
      defaultPageSize: 25,
      maxPageSize: 100,
      allowedPageSizes: [25, 50, 100],
      allowedFilterKeys: ["isActive", "programId", "levelId", "tutorId"],
    });

  const [searchInput, setSearchInput] = useState(() => state.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  useEffect(() => {
    if (debouncedSearch === state.search) return;
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch, state.search]);

  const refreshGroups = useCallback(async () => {
    setIsLoading(true);
    setListError(null);

    // Step 21.3 Admin Table query contract keeps group list params consistent.
    const params = buildAdminTableParams(state);

    try {
      const groupsResult = await fetchJson<GroupsResponse>(
        buildTenantApiUrl(tenant, `/groups?${params.toString()}`),
        { cache: "no-store" },
      );

      if (
        !groupsResult.ok &&
        (groupsResult.status === 401 || groupsResult.status === 403)
      ) {
        setListError(t("admin.groups.messages.forbidden"));
        return false;
      }

      if (!groupsResult.ok && groupsResult.status === 0) {
        console.error("Failed to load groups", groupsResult.details);
        setListError(t("common.error"));
        return false;
      }

      if (!groupsResult.ok) {
        setListError(t("admin.groups.messages.loadError"));
        return false;
      }

      setGroups(groupsResult.data.rows);
      setTotalCount(groupsResult.data.totalCount);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [state, t, tenant]);

  const loadOptions = useCallback(async () => {
    const [centersResult, programsResult, levelsResult, tutorsResult] =
      await Promise.all([
      fetchJson<CenterOption[]>(
        buildTenantApiUrl(tenant, "/centers?includeInactive=true"),
      ),
      fetchJson<ProgramOptionsResponse>(
        buildTenantApiUrl(
          tenant,
          `/programs?${new URLSearchParams({
            page: "1",
            pageSize: "100",
            sortField: "name",
            sortDir: "asc",
          }).toString()}`,
        ),
      ),
      fetchJson<LevelOptionsResponse>(
        buildTenantApiUrl(
          tenant,
          `/levels?${new URLSearchParams({
            page: "1",
            pageSize: "100",
            sortField: "name",
            sortDir: "asc",
          }).toString()}`,
        ),
      ),
      fetchJson<TutorsResponse>(
        buildTenantApiUrl(
          tenant,
          `/users?${new URLSearchParams({
            page: "1",
            pageSize: "100",
            sortField: "name",
            sortDir: "asc",
            filters: JSON.stringify({ role: "Tutor" }),
          }).toString()}`,
        ),
      ),
    ]);

    if (
      (!centersResult.ok &&
        (centersResult.status === 401 || centersResult.status === 403)) ||
      (!programsResult.ok &&
        (programsResult.status === 401 || programsResult.status === 403)) ||
      (!levelsResult.ok &&
        (levelsResult.status === 401 || levelsResult.status === 403)) ||
      (!tutorsResult.ok &&
        (tutorsResult.status === 401 || tutorsResult.status === 403))
    ) {
      setListError(t("admin.groups.messages.forbidden"));
      return false;
    }

    if (
      (!centersResult.ok && centersResult.status === 0) ||
      (!programsResult.ok && programsResult.status === 0) ||
      (!levelsResult.ok && levelsResult.status === 0) ||
      (!tutorsResult.ok && tutorsResult.status === 0)
    ) {
      console.error("Failed to load group options", {
        centers: centersResult,
        programs: programsResult,
        levels: levelsResult,
        tutors: tutorsResult,
      });
      setListError(t("common.error"));
      return false;
    }

    if (
      !centersResult.ok ||
      !programsResult.ok ||
      !levelsResult.ok ||
      !tutorsResult.ok
    ) {
      setListError(t("admin.groups.messages.loadError"));
      return false;
    }

    setCenters(centersResult.data);
    setPrograms(programsResult.data.rows);
    setLevels(levelsResult.data.rows);
    setTutors(tutorsResult.data.rows ?? []);
    return true;
  }, [t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void refreshGroups();
    }, 0);
    return () => clearTimeout(handle);
  }, [refreshGroups, reloadNonce]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const openCreateModal = useCallback(() => {
    setForm(emptyForm);
    setIsModalOpen(true);
    setListError(null);
    setFormError(null);
    setMessage(null);
  }, []);

  const openEditModal = useCallback((group: GroupListItem) => {
    setForm(toFormState(group));
    setIsModalOpen(true);
    setListError(null);
    setFormError(null);
    setMessage(null);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setFormError(null);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setListError(null);
    setFormError(null);
    setMessage(null);

    const trimmedName = form.name.trim();
    const centerId = form.centerId.trim();
    const programId = form.programId.trim();
    const notesValue = form.notes.trim();
    const levelIdValue = form.levelId.trim();
    const capacityValue = form.capacity.trim();

    if (!trimmedName || !centerId || !programId) {
      setFormError(t("admin.groups.messages.validationError"));
      setIsSaving(false);
      return;
    }

    let capacity: number | null = null;
    if (capacityValue.length) {
      const parsed = Number(capacityValue);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        setFormError(t("admin.groups.messages.validationError"));
        setIsSaving(false);
        return;
      }
      capacity = parsed;
    }

    const payload = {
      name: trimmedName,
      type: form.type,
      centerId,
      programId,
      levelId: levelIdValue.length ? levelIdValue : null,
      capacity,
      notes: notesValue.length ? notesValue : null,
    };

    const url = isEditing
      ? buildTenantApiUrl(tenant, `/groups/${form.id}`)
      : buildTenantApiUrl(tenant, "/groups");
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<{ group: GroupListItem }>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setFormError(t("admin.groups.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setFormError(
        isValidation
          ? t("admin.groups.messages.validationError")
          : t("admin.groups.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshGroups();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
    setMessage(
      isEditing
        ? t("admin.groups.messages.updateSuccess")
        : t("admin.groups.messages.createSuccess"),
    );
  }

  const toggleActive = useCallback(
    async (group: GroupListItem) => {
      setIsSaving(true);
      setListError(null);
      setMessage(null);

      const result = await fetchJson<{ group: GroupListItem }>(
        buildTenantApiUrl(tenant, `/groups/${group.id}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !group.isActive }),
        },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setListError(t("admin.groups.messages.forbidden"));
        setIsSaving(false);
        return;
      }

      if (!result.ok) {
        setListError(t("admin.groups.messages.loadError"));
        setIsSaving(false);
        return;
      }

      await refreshGroups();
      setMessage(t("admin.groups.messages.updateSuccess"));
      setIsSaving(false);
    },
    [refreshGroups, t, tenant],
  );

  const filterChips = useMemo<AdminFilterChip[]>(() => {
    const chips: AdminFilterChip[] = [];
    const programId =
      typeof state.filters.programId === "string"
        ? state.filters.programId
        : "";
    const levelId =
      typeof state.filters.levelId === "string"
        ? state.filters.levelId
        : "";
    const tutorId =
      typeof state.filters.tutorId === "string"
        ? state.filters.tutorId
        : "";
    if (typeof state.filters.isActive === "boolean") {
      chips.push({
        key: "isActive",
        label: t("admin.groups.fields.status"),
        value: state.filters.isActive
          ? t("common.status.active")
          : t("common.status.inactive"),
        onRemove: () => setFilter("isActive", null),
      });
    }
    if (programId) {
      chips.push({
        key: "programId",
        label: t("admin.groups.fields.program"),
        value:
          programs.find((program) => program.id === programId)?.name ??
          programId,
        onRemove: () => setFilter("programId", ""),
      });
    }
    if (levelId) {
      chips.push({
        key: "levelId",
        label: t("admin.groups.fields.level"),
        value: levels.find((level) => level.id === levelId)?.name ?? levelId,
        onRemove: () => setFilter("levelId", ""),
      });
    }
    if (tutorId) {
      chips.push({
        key: "tutorId",
        label: t("admin.groups.fields.tutorsCount"),
        value: tutors.find((tutor) => tutor.id === tutorId)?.name ?? tutorId,
        onRemove: () => setFilter("tutorId", ""),
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
  }, [
    levels,
    programs,
    setFilter,
    setSearch,
    state.filters.isActive,
    state.filters.levelId,
    state.filters.programId,
    state.filters.tutorId,
    state.search,
    t,
    tutors,
  ]);

  const clearAll = () => {
    setSearchInput("");
    resetAll({ sortField: "name", sortDir: "asc" });
  };

  const columns: AdminDataTableColumn<GroupListItem>[] = useMemo(
    () => [
      {
        key: "name",
        label: t("admin.groups.fields.name"),
        sortable: true,
        sortField: "name",
        renderCell: (group) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-900">{group.name}</span>
            <span className="text-xs text-slate-500">
              {groupTypeLabels[group.type]}
            </span>
          </div>
        ),
      },
      {
        key: "programName",
        label: t("admin.groups.fields.program"),
        sortable: true,
        sortField: "programName",
        renderCell: (group) => group.programName,
      },
      {
        key: "levelName",
        label: t("admin.groups.fields.level"),
        sortable: true,
        sortField: "levelName",
        renderCell: (group) =>
          group.levelName ?? t("admin.groups.messages.noLevel"),
      },
      {
        key: "tutorsCount",
        label: t("admin.groups.fields.tutorsCount"),
        sortable: true,
        sortField: "tutorsCount",
        renderCell: (group) => (
          // data-testid hooks keep count assertions stable in E2E.
          <span data-testid="group-tutors-count">{group.tutorsCount}</span>
        ),
      },
      {
        key: "studentsCount",
        label: t("admin.groups.fields.studentsCount"),
        sortable: true,
        sortField: "studentsCount",
        renderCell: (group) => (
          // data-testid hooks keep count assertions stable in E2E.
          <span data-testid="group-students-count">{group.studentsCount}</span>
        ),
      },
      {
        key: "status",
        label: t("admin.groups.fields.status"),
        sortable: true,
        sortField: "status",
        renderCell: (group) =>
          group.isActive
            ? t("common.status.active")
            : t("common.status.inactive"),
      },
      {
        key: "actions",
        label: t("admin.groups.fields.actions"),
        renderCell: (group) => (
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => openEditModal(group)}
              type="button"
            >
              {t("admin.groups.edit")}
            </button>
            <Link
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              data-testid="manage-group-link"
              href={`/${tenant}/admin/groups/${group.id}`}
            >
              {t("admin.groups.actions.manage")}
            </Link>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              disabled={isSaving}
              onClick={() => toggleActive(group)}
              type="button"
            >
              {group.isActive
                ? t("common.actions.deactivate")
                : t("common.actions.activate")}
            </button>
          </div>
        ),
      },
    ],
    [groupTypeLabels, isSaving, openEditModal, t, tenant, toggleActive],
  );

  const emptyState: AdminEmptyState = useMemo(
    () => ({
      title: t("admin.groupsList.empty.title"),
      body: t("admin.groupsList.empty.body"),
    }),
    [t],
  );

  const rightSlot = (
    <button
      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      data-testid="create-group-button"
      onClick={openCreateModal}
      type="button"
    >
      {t("admin.groups.create")}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminTableToolbar
        searchId="groups-list-search"
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
          <AdminDataTable<GroupListItem>
            columns={columns}
            rows={groups}
            rowKey={(group) => `group-row-${group.id}`}
            isLoading={isLoading}
            emptyState={emptyState}
            sortField={state.sortField}
            sortDir={state.sortDir}
            onSortChange={(field, dir) => setSort(field, dir ?? "asc")}
            testId="groups-table"
            onRowClick={(group) =>
              router.push(`/${tenant}/admin/groups/${group.id}`)
            }
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
          label={t("admin.groups.fields.status")}
          htmlFor="groups-filter-status"
        >
          <select
            id="groups-filter-status"
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
            <option value="ACTIVE">{t("admin.reports.statusFilter.active")}</option>
            <option value="INACTIVE">{t("admin.reports.statusFilter.inactive")}</option>
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.groups.fields.program")}
          htmlFor="groups-filter-program"
        >
          <select
            id="groups-filter-program"
            className="rounded border border-slate-300 px-3 py-2"
            value={
              typeof state.filters.programId === "string"
                ? state.filters.programId
                : ""
            }
            onChange={(event) => setFilter("programId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allPrograms")}</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.groups.fields.level")}
          htmlFor="groups-filter-level"
        >
          <select
            id="groups-filter-level"
            className="rounded border border-slate-300 px-3 py-2"
            value={
              typeof state.filters.levelId === "string"
                ? state.filters.levelId
                : ""
            }
            onChange={(event) => setFilter("levelId", event.target.value)}
          >
            <option value="">{t("admin.reports.filters.allLevels")}</option>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField
          label={t("admin.groups.fields.tutorsCount")}
          htmlFor="groups-filter-tutor"
        >
          <select
            id="groups-filter-tutor"
            className="rounded border border-slate-300 px-3 py-2"
            value={
              typeof state.filters.tutorId === "string"
                ? state.filters.tutorId
                : ""
            }
            onChange={(event) => setFilter("tutorId", event.target.value)}
          >
            <option value="">{t("admin.sessions.filters.allTutors")}</option>
            {tutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id}>
                {tutor.name ?? tutor.email}
              </option>
            ))}
          </select>
        </AdminFormField>
      </AdminFiltersSheet>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isEditing ? t("admin.groups.edit") : t("admin.groups.create")}
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
            <form
              className="mt-4 grid gap-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-700">
                    {t("admin.groups.fields.name")}
                  </span>
                  <input
                    className="rounded border border-slate-300 px-3 py-2"
                    data-testid="group-name-input"
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-700">
                    {t("admin.groups.fields.type")}
                  </span>
                  <select
                    className="rounded border border-slate-300 px-3 py-2"
                    data-testid="group-type-select"
                    value={form.type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        type: event.target.value as GroupTypeValue,
                      }))
                    }
                  >
                    {GROUP_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {groupTypeLabels[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-700">
                    {t("admin.groups.fields.center")}
                  </span>
                  <select
                    className="rounded border border-slate-300 px-3 py-2"
                    data-testid="group-center-select"
                    value={form.centerId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        centerId: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {t("admin.groups.messages.noCenter")}
                    </option>
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-700">
                    {t("admin.groups.fields.program")}
                  </span>
                  <select
                    className="rounded border border-slate-300 px-3 py-2"
                    data-testid="group-program-select"
                    value={form.programId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        programId: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {t("admin.groups.messages.noProgram")}
                    </option>
                    {programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-700">
                    {t("admin.groups.fields.level")}
                  </span>
                  <select
                    className="rounded border border-slate-300 px-3 py-2"
                    data-testid="group-level-select"
                    value={form.levelId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        levelId: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {t("admin.groups.messages.noLevel")}
                    </option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-700">
                    {t("admin.groups.fields.capacity")}
                  </span>
                  <input
                    className="rounded border border-slate-300 px-3 py-2"
                    data-testid="group-capacity-input"
                    min={0}
                    type="number"
                    value={form.capacity}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        capacity: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-700">
                  {t("admin.groups.fields.notes")}
                </span>
                <textarea
                  className="min-h-[100px] rounded border border-slate-300 px-3 py-2"
                  data-testid="group-notes-input"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  data-testid="save-group-button"
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
