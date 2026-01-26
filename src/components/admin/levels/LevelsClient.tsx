// Client-side levels admin UI with modal create/edit and active toggles.
// RBAC + tenant scoping are enforced server-side; this client focuses on UX state.
// fetchJson keeps API error shapes predictable; AdminTable keeps layout consistent.
// Extend later with filters/search by layering on refreshLevels without changing API shape.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { fetchJson } from "@/lib/api/fetchJson";

type LevelRecord = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type LevelsClientProps = {
  initialLevels: LevelRecord[];
};

type LevelFormState = {
  id: string | null;
  name: string;
  sortOrder: string;
};

const emptyForm: LevelFormState = {
  id: null,
  name: "",
  sortOrder: "",
};

function toFormState(level: LevelRecord): LevelFormState {
  return {
    id: level.id,
    name: level.name,
    sortOrder: String(level.sortOrder ?? 0),
  };
}

export default function LevelsClient({ initialLevels }: LevelsClientProps) {
  const t = useTranslations();
  const [levels, setLevels] = useState<LevelRecord[]>(initialLevels);
  const [form, setForm] = useState<LevelFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isEditing = Boolean(form.id);

  const refreshLevels = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchJson<LevelRecord[]>("/api/levels");

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setError(t("admin.levels.messages.forbidden"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load levels", result.details);
        setError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setError(t("admin.levels.messages.loadError"));
        return false;
      }

      setLevels(result.data);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshLevels();
  }, [refreshLevels]);

  function openCreateModal() {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function openEditModal(level: LevelRecord) {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(level));
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
    if (!trimmedName) {
      setError(t("admin.levels.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const payload: { name: string; sortOrder?: number } = {
      name: trimmedName,
    };

    const sortOrderValue = form.sortOrder.trim();
    if (sortOrderValue.length) {
      const parsed = Number.parseInt(sortOrderValue, 10);
      if (Number.isNaN(parsed)) {
        setError(t("admin.levels.messages.validationError"));
        setIsSaving(false);
        return;
      }
      payload.sortOrder = parsed;
    }

    const url = isEditing ? `/api/levels/${form.id}` : "/api/levels";
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<LevelRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.levels.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setError(
        isValidation
          ? t("admin.levels.messages.validationError")
          : t("admin.levels.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshLevels();
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

  async function toggleActive(level: LevelRecord) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<LevelRecord>(`/api/levels/${level.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !level.isActive }),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.levels.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      setError(t("admin.levels.messages.loadError"));
      setIsSaving(false);
      return;
    }

    await refreshLevels();
    setMessage(t("admin.levels.messages.updateSuccess"));
    setIsSaving(false);
  }

  const columns: AdminTableColumn<LevelRecord>[] = [
    {
      header: t("admin.levels.fields.name"),
      cell: (level) => level.name,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 font-medium text-slate-900",
    },
    {
      header: t("admin.levels.fields.status"),
      cell: (level) =>
        level.isActive
          ? t("common.status.active")
          : t("common.status.inactive"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.levels.fields.actions"),
      cell: (level) => (
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
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const loadingState = t("common.loading");
  const emptyState = t("admin.levels.messages.empty");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="create-level-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.levels.create")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {isLoading ? (
        <p className="text-sm text-slate-600">{t("common.loading")}</p>
      ) : null}

      <AdminTable
        rows={levels}
        columns={columns}
        rowKey={(level) => `level-row-${level.id}`}
        testId="levels-table"
        isLoading={isLoading}
        loadingState={loadingState}
        emptyState={emptyState}
      />

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
                <span className="text-slate-700">{t("admin.levels.fields.name")}</span>
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
                <span className="text-slate-700">{t("admin.levels.fields.sortOrder")}</span>
                <input
                  className="rounded border border-slate-300 px-3 py-2"
                  data-testid="level-sortorder-input"
                  inputMode="numeric"
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
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
