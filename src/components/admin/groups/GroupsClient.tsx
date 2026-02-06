// Client-side groups admin UI with modal create/edit and active toggles.
// RBAC + tenant scoping are enforced server-side; this client focuses on UX state.
// fetchJson keeps API error shapes predictable; AdminTable keeps layout consistent.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { buildTenantApiUrl } from "@/lib/api/buildTenantApiUrl";
import { fetchJson } from "@/lib/api/fetchJson";

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

type GroupsClientProps = {
  initialGroups: GroupListItem[];
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
  initialGroups,
  centers: initialCenters,
  programs: initialPrograms,
  levels: initialLevels,
  tenant,
}: GroupsClientProps) {
  const t = useTranslations();
  const [groups, setGroups] = useState<GroupListItem[]>(initialGroups);
  const [centers, setCenters] = useState<CenterOption[]>(initialCenters);
  const [programs, setPrograms] = useState<ProgramOption[]>(initialPrograms);
  const [levels, setLevels] = useState<LevelOption[]>(initialLevels);
  const [form, setForm] = useState<GroupFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isEditing = Boolean(form.id);

  const groupTypeLabels = useMemo(() => {
    return {
      GROUP: t("admin.groups.types.group"),
      CLASS: t("admin.groups.types.class"),
    };
  }, [t, tenant]);

  const refreshGroups = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [groupsResult, centersResult, programsResult, levelsResult] =
        await Promise.all([
          fetchJson<{ groups: GroupListItem[] }>(
            buildTenantApiUrl(tenant, "/groups"),
          ),
          fetchJson<CenterOption[]>(
            buildTenantApiUrl(tenant, "/centers?includeInactive=true"),
          ),
          fetchJson<ProgramOption[]>(
            buildTenantApiUrl(tenant, "/programs"),
          ),
          fetchJson<LevelOption[]>(buildTenantApiUrl(tenant, "/levels")),
        ]);

      if (
        (!groupsResult.ok &&
          (groupsResult.status === 401 || groupsResult.status === 403)) ||
        (!centersResult.ok &&
          (centersResult.status === 401 || centersResult.status === 403)) ||
        (!programsResult.ok &&
          (programsResult.status === 401 || programsResult.status === 403)) ||
        (!levelsResult.ok &&
          (levelsResult.status === 401 || levelsResult.status === 403))
      ) {
        setError(t("admin.groups.messages.forbidden"));
        return false;
      }

      if (
        (!groupsResult.ok && groupsResult.status === 0) ||
        (!centersResult.ok && centersResult.status === 0) ||
        (!programsResult.ok && programsResult.status === 0) ||
        (!levelsResult.ok && levelsResult.status === 0)
      ) {
        console.error("Failed to load group data", {
          groups: groupsResult,
          centers: centersResult,
          programs: programsResult,
          levels: levelsResult,
        });
        setError(t("common.error"));
        return false;
      }

      if (
        !groupsResult.ok ||
        !centersResult.ok ||
        !programsResult.ok ||
        !levelsResult.ok
      ) {
        setError(t("admin.groups.messages.loadError"));
        return false;
      }

      setGroups(groupsResult.data.groups);
      setCenters(centersResult.data);
      setPrograms(programsResult.data);
      setLevels(levelsResult.data);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  function openCreateModal() {
    setForm(emptyForm);
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function openEditModal(group: GroupListItem) {
    setForm(toFormState(group));
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function closeModal() {
    setIsModalOpen(false);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const trimmedName = form.name.trim();
    const centerId = form.centerId.trim();
    const programId = form.programId.trim();
    const notesValue = form.notes.trim();
    const levelIdValue = form.levelId.trim();
    const capacityValue = form.capacity.trim();

    if (!trimmedName || !centerId || !programId) {
      setError(t("admin.groups.messages.validationError"));
      setIsSaving(false);
      return;
    }

    let capacity: number | null = null;
    if (capacityValue.length) {
      const parsed = Number(capacityValue);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        setError(t("admin.groups.messages.validationError"));
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
      setError(t("admin.groups.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setError(
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

  async function toggleActive(group: GroupListItem) {
    setIsSaving(true);
    setError(null);
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
      setError(t("admin.groups.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      setError(t("admin.groups.messages.loadError"));
      setIsSaving(false);
      return;
    }

    await refreshGroups();
    setMessage(t("admin.groups.messages.updateSuccess"));
    setIsSaving(false);
  }

  const columns: AdminTableColumn<GroupListItem>[] = [
    {
      header: t("admin.groups.fields.name"),
      cell: (group) => group.name,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 font-medium text-slate-900",
    },
    {
      header: t("admin.groups.fields.type"),
      cell: (group) => groupTypeLabels[group.type],
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.groups.fields.center"),
      cell: (group) => group.centerName,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.groups.fields.program"),
      cell: (group) => group.programName,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.groups.fields.level"),
      cell: (group) => group.levelName ?? t("admin.groups.messages.noLevel"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.groups.fields.tutorsCount"),
      cell: (group) => (
        // data-testid hooks keep count assertions stable in E2E.
        <span data-testid="group-tutors-count">
          {group.tutorsCount.toString()}
        </span>
      ),
      headClassName: "px-4 py-3 text-right",
      cellClassName: "px-4 py-3 text-right text-slate-700",
    },
    {
      header: t("admin.groups.fields.studentsCount"),
      cell: (group) => (
        // data-testid hooks keep count assertions stable in E2E.
        <span data-testid="group-students-count">
          {group.studentsCount.toString()}
        </span>
      ),
      headClassName: "px-4 py-3 text-right",
      cellClassName: "px-4 py-3 text-right text-slate-700",
    },
    {
      header: t("admin.groups.fields.status"),
      cell: (group) =>
        group.isActive
          ? t("common.status.active")
          : t("common.status.inactive"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.groups.fields.actions"),
      cell: (group) => (
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
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const loadingState = t("common.loading");
  const emptyState = t("admin.groups.messages.empty");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="create-group-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.groups.create")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {isLoading ? (
        <p className="text-sm text-slate-600">{t("common.loading")}</p>
      ) : null}

      <AdminTable
        rows={groups}
        columns={columns}
        rowKey={(group) => `group-row-${group.id}`}
        testId="groups-table"
        isLoading={isLoading}
        loadingState={loadingState}
        emptyState={emptyState}
      />

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
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
