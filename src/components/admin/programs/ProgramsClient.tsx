// Client-side programs admin UI with modal create/edit and active toggles.
// RBAC + tenant scoping are enforced server-side; this client focuses on UX state.
// fetchJson keeps API error shapes predictable; AdminTable keeps layout consistent.
// Extend later with filters/search or level filters by reusing refreshPrograms.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type ProgramRecord = {
  id: string;
  name: string;
  subjectId: string | null;
  isActive: boolean;
};

type ProgramsClientProps = {
  initialPrograms: ProgramRecord[];
  initialSubjects: SubjectRecord[];
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

export default function ProgramsClient({
  initialPrograms,
  initialSubjects,
}: ProgramsClientProps) {
  const t = useTranslations();
  const [programs, setPrograms] = useState<ProgramRecord[]>(initialPrograms);
  const [subjects, setSubjects] = useState<SubjectRecord[]>(initialSubjects);
  const [form, setForm] = useState<ProgramFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isEditing = Boolean(form.id);

  const subjectLookup = useMemo(() => {
    return new Map(subjects.map((subject) => [subject.id, subject.name]));
  }, [subjects]);

  const refreshPrograms = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [programsResult, subjectsResult] = await Promise.all([
        fetchJson<ProgramRecord[]>("/api/programs"),
        fetchJson<SubjectRecord[]>("/api/subjects"),
      ]);

      if (
        (!programsResult.ok &&
          (programsResult.status === 401 || programsResult.status === 403)) ||
        (!subjectsResult.ok &&
          (subjectsResult.status === 401 || subjectsResult.status === 403))
      ) {
        setError(t("admin.programs.messages.forbidden"));
        return false;
      }

      if (
        (!programsResult.ok && programsResult.status === 0) ||
        (!subjectsResult.ok && subjectsResult.status === 0)
      ) {
        console.error("Failed to load programs", {
          programs: programsResult,
          subjects: subjectsResult,
        });
        setError(t("common.error"));
        return false;
      }

      if (!programsResult.ok || !subjectsResult.ok) {
        setError(t("admin.programs.messages.loadError"));
        return false;
      }

      setPrograms(programsResult.data);
      setSubjects(subjectsResult.data);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshPrograms();
  }, [refreshPrograms]);

  function openCreateModal() {
    // Reset state for a fresh create flow.
    setForm(emptyForm);
    setIsModalOpen(true);
    setError(null);
    setMessage(null);
  }

  function openEditModal(program: ProgramRecord) {
    // Populate the form for editing without extra API calls.
    setForm(toFormState(program));
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
      setError(t("admin.programs.messages.validationError"));
      setIsSaving(false);
      return;
    }

    const subjectIdValue = form.subjectId.trim();
    const payload = {
      name: trimmedName,
      subjectId: subjectIdValue.length ? subjectIdValue : null,
    };

    const url = isEditing ? `/api/programs/${form.id}` : "/api/programs";
    const method = isEditing ? "PATCH" : "POST";
    const body = isEditing ? payload : { ...payload, isActive: true };

    const result = await fetchJson<ProgramRecord>(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.programs.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      const isValidation =
        result.status === 400 && result.error === "ValidationError";
      setError(
        isValidation
          ? t("admin.programs.messages.validationError")
          : t("admin.programs.messages.loadError"),
      );
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshPrograms();
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

  async function toggleActive(program: ProgramRecord) {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const result = await fetchJson<ProgramRecord>(`/api/programs/${program.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !program.isActive }),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.programs.messages.forbidden"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      setError(t("admin.programs.messages.loadError"));
      setIsSaving(false);
      return;
    }

    await refreshPrograms();
    setMessage(t("admin.programs.messages.updateSuccess"));
    setIsSaving(false);
  }

  const columns: AdminTableColumn<ProgramRecord>[] = [
    {
      header: t("admin.programs.fields.name"),
      cell: (program) => program.name,
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 font-medium text-slate-900",
    },
    {
      header: t("admin.programs.fields.subject"),
      cell: (program) =>
        program.subjectId
          ? subjectLookup.get(program.subjectId) ??
            t("admin.programs.messages.noSubject")
          : t("admin.programs.messages.noSubject"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.programs.fields.status"),
      cell: (program) =>
        program.isActive
          ? t("common.status.active")
          : t("common.status.inactive"),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3 text-slate-700",
    },
    {
      header: t("admin.programs.fields.actions"),
      cell: (program) => (
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
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  const loadingState = t("common.loading");
  const emptyState = t("admin.programs.messages.empty");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          data-testid="create-program-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.programs.create")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {isLoading ? (
        <p className="text-sm text-slate-600">{t("common.loading")}</p>
      ) : null}

      <AdminTable
        rows={programs}
        columns={columns}
        rowKey={(program) => `program-row-${program.id}`}
        testId="programs-table"
        isLoading={isLoading}
        loadingState={loadingState}
        emptyState={emptyState}
      />

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isEditing ? t("admin.programs.edit") : t("admin.programs.create")}
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
                <span className="text-slate-700">{t("admin.programs.fields.name")}</span>
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
                <span className="text-slate-700">{t("admin.programs.fields.subject")}</span>
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
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
