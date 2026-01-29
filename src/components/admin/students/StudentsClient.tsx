// Client-side students list with create modal and tenant-scoped API refresh.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminModalShell from "@/components/admin/shared/AdminModalShell";
import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { fetchJson } from "@/lib/api/fetchJson";

type StudentStatusValue = "ACTIVE" | "INACTIVE" | "ARCHIVED";

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

export default function StudentsClient({ tenant }: StudentsClientProps) {
  const t = useTranslations();
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [form, setForm] = useState<StudentFormState>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStudents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchJson<StudentsResponse>("/api/students");

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setError(t("admin.students.messages.error"));
        return false;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load students", result.details);
        setError(t("common.error"));
        return false;
      }

      if (!result.ok) {
        setError(t("admin.students.messages.error"));
        return false;
      }

      setStudents(result.data.students);
      return true;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const refreshLevels = useCallback(async () => {
    const result = await fetchJson<LevelOption[]>("/api/levels");
    if (result.ok) {
      setLevels(result.data);
    } else {
      setLevels([]);
    }
  }, []);

  useEffect(() => {
    void refreshStudents();
    void refreshLevels();
  }, [refreshStudents, refreshLevels]);

  function openCreateModal() {
    // Reset state so each create flow starts clean.
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
      "/api/students",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.students.messages.error"));
      setIsSaving(false);
      return;
    }

    if (!result.ok && result.status === 0) {
      console.error("Failed to create student", result.details);
      setError(t("common.error"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      setError(t("admin.students.messages.error"));
      setIsSaving(false);
      return;
    }

    const refreshed = await refreshStudents();
    setIsSaving(false);
    if (!refreshed) {
      return;
    }

    setIsModalOpen(false);
  }

  const columns: AdminTableColumn<StudentListItem>[] = useMemo(
    () => [
      {
        header: t("admin.students.table.name"),
        cell: (student) => formatStudentName(student),
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3 font-medium text-slate-900",
      },
      {
        header: t("admin.students.table.level"),
        cell: (student) => student.level?.name ?? "",
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3 text-slate-700",
      },
      {
        header: t("admin.students.table.grade"),
        cell: (student) => student.grade ?? "",
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3 text-slate-700",
      },
      {
        header: t("admin.students.table.parentCount"),
        cell: (student) => student.parentCount,
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3 text-slate-700",
      },
      {
        header: t("admin.students.table.status"),
        cell: (student) =>
          student.status === "ACTIVE"
            ? t("admin.students.status.active")
            : t("admin.students.status.inactive"),
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3 text-slate-700",
      },
      {
        header: t("admin.students.table.actions"),
        cell: (student) => (
          <div className="flex flex-wrap gap-2">
            {/* Query param toggles read-only vs edit mode on the detail screen. */}
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
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3",
      },
    ],
    [t, tenant],
  );

  const loadingState = t("admin.students.messages.loading");
  const emptyState = t("admin.students.messages.empty");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          // data-testid keeps create flows stable without relying on labels.
          data-testid="create-student-button"
          onClick={openCreateModal}
          type="button"
        >
          {t("admin.students.actions.create")}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {isLoading ? (
        <p className="text-sm text-slate-600">{loadingState}</p>
      ) : null}

      <AdminTable
        rows={students}
        columns={columns}
        rowKey={(student) => `students-row-${student.id}`}
        testId="students-table"
        isLoading={isLoading}
        loadingState={loadingState}
        emptyState={emptyState}
      />

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded border border-slate-200 bg-white p-6 shadow-xl">
            <form noValidate onSubmit={handleCreate}>
              <AdminModalShell
                title={t("admin.students.actions.create")}
                footer={
                  <>
                    <button
                      className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                      disabled={isSaving}
                      onClick={closeModal}
                      type="button"
                    >
                      {t("common.actions.cancel")}
                    </button>
                    <button
                      className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      // data-testid keeps save action stable in E2E.
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
                {/* AdminFormField keeps modal spacing consistent with other admin forms. */}
                <AdminFormField
                  label={t("admin.students.fields.firstName")}
                  htmlFor="student-create-first-name"
                  required
                >
                  <input
                    className="rounded border border-slate-300 px-3 py-2"
                    // data-testid keeps first name input stable in E2E.
                    data-testid="student-first-name-input"
                    id="student-create-first-name"
                    value={form.firstName}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        firstName: event.target.value,
                      }))
                    }
                  />
                </AdminFormField>
                <AdminFormField
                  label={t("admin.students.fields.lastName")}
                  htmlFor="student-create-last-name"
                  required
                >
                  <input
                    className="rounded border border-slate-300 px-3 py-2"
                    // data-testid keeps last name input stable in E2E.
                    data-testid="student-last-name-input"
                    id="student-create-last-name"
                    value={form.lastName}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        lastName: event.target.value,
                      }))
                    }
                  />
                </AdminFormField>
                <AdminFormField
                  label={t("admin.students.fields.level")}
                  htmlFor="student-create-level"
                >
                  <select
                    className="rounded border border-slate-300 px-3 py-2"
                    // data-testid keeps level selection stable in E2E.
                    data-testid="student-level-select"
                    id="student-create-level"
                    value={form.levelId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        levelId: event.target.value,
                      }))
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
                    className="rounded border border-slate-300 px-3 py-2"
                    id="student-create-grade"
                    // data-testid keeps grade input stable in E2E.
                    data-testid="student-grade-input"
                    value={form.grade}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        grade: event.target.value,
                      }))
                    }
                  />
                </AdminFormField>
                {error ? (
                  <p className="text-sm text-red-600">{error}</p>
                ) : null}
              </AdminModalShell>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
