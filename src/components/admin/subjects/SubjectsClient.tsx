// Client-side subjects admin UI with modal create/edit and active toggles.
// RBAC + tenant scoping are enforced server-side; this client focuses on UX state.
// fetchJson keeps API error shapes predictable; AdminTable keeps layout consistent.
// Extend later with filters/search by layering on refreshSubjects without changing API shape.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { fetchJson } from "@/lib/api/fetchJson";

type SubjectRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

type SubjectsClientProps = {
  initialSubjects: SubjectRecord[];
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

export default function SubjectsClient({
  initialSubjects,
}: SubjectsClientProps) {
  const t = useTranslations();
  const [subjects, setSubjects] = useState<SubjectRecord[]>(initialSubjects);
  const [form, setForm] = useState<SubjectFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isEditing = Boolean(form.id);

  const refreshSubjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchJson<SubjectRecord[]>("/api/subjects");

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setError(t("admin.subjects.messages.forbidden"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load subjects", result.details);
        setError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setError(t("admin.subjects.messages.loadError"));
        return false;
      }

      setSubjects(result.data);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshSubjects();
  }, [refreshSubjects]);

  function openCreateModal() {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function openEditModal(subject: SubjectRecord) {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(subject));
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
      setError(t("admin.subjects.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const payload = { name: trimmedName };
    const url = isEditing ? `/api/subjects/${form.id}` : "/api/subjects";
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<SubjectRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.subjects.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setError(
        isValidation
          ? t("admin.subjects.messages.validationError")
          : t("admin.subjects.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshSubjects();
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

  async function toggleActive(subject: SubjectRecord) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<SubjectRecord>(`/api/subjects/${subject.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !subject.isActive }),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.subjects.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      setError(t("admin.subjects.messages.loadError"));
      setIsSaving(false);
      return;
    }

    await refreshSubjects();
    setMessage(t("admin.subjects.messages.updateSuccess"));
    setIsSaving(false);
  }

  const columns: AdminTableColumn<SubjectRecord>[] = [
    {
      header: t("admin.subjects.fields.name"),
      cell: (subject) => subject.name,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 font-medium text-slate-900",
    },
    {
      header: t("admin.subjects.fields.status"),
      cell: (subject) =>
        subject.isActive
          ? t("common.status.active")
          : t("common.status.inactive"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.subjects.fields.actions"),
      cell: (subject) => (
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
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const loadingState = t("common.loading");
  const emptyState = t("admin.subjects.messages.empty");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="create-subject-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.subjects.create")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {isLoading ? (
        <p className="text-sm text-slate-600">{t("common.loading")}</p>
      ) : null}

      <AdminTable
        rows={subjects}
        columns={columns}
        rowKey={(subject) => `subject-row-${subject.id}`}
        testId="subjects-table"
        isLoading={isLoading}
        loadingState={loadingState}
        emptyState={emptyState}
      />

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isEditing ? t("admin.subjects.edit") : t("admin.subjects.create")}
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
                <span className="text-slate-700">{t("admin.subjects.fields.name")}</span>
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
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
