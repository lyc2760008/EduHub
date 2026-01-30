// Client-side student detail form with parents linking via tenant-scoped APIs.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import AdminModalShell from "@/components/admin/shared/AdminModalShell";
import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { fetchJson } from "@/lib/api/fetchJson";

type StudentStatusValue = "ACTIVE" | "INACTIVE" | "ARCHIVED";

type LevelOption = {
  id: string;
  name: string;
  isActive?: boolean;
};

type StudentDetail = {
  id: string;
  firstName: string;
  lastName: string;
  grade?: string | null;
  level?: { id: string; name: string } | null;
  status: StudentStatusValue;
  notes?: string | null;
};

type ParentLink = {
  id: string;
  parentId: string;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  };
};

type StudentDetailClientProps = {
  studentId: string;
};

type StudentFormState = {
  firstName: string;
  lastName: string;
  levelId: string;
  grade: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: StudentFormState = {
  firstName: "",
  lastName: "",
  levelId: "",
  grade: "",
  notes: "",
  isActive: true,
};

function formatParentName(parent: ParentLink["parent"]) {
  return `${parent.firstName} ${parent.lastName}`.trim();
}

export default function StudentDetailClient({
  studentId,
}: StudentDetailClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  // "view" mode disables edits while keeping the detail page readable.
  const isReadOnly = searchParams.get("mode") === "view";
  const [form, setForm] = useState<StudentFormState>(emptyForm);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [parents, setParents] = useState<ParentLink[]>([]);
  const [parentEmail, setParentEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isParentsLoading, setIsParentsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [parentsError, setParentsError] = useState<string | null>(null);
  const [parentsMessage, setParentsMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ParentLink | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  const loadStudent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchJson<{ student: StudentDetail }>(
        `/api/students/${studentId}`,
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setError(t("admin.students.messages.error"));
        return;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load student", result.details);
        setError(t("common.error"));
        return;
      }

      if (!result.ok) {
        setError(t("admin.students.messages.error"));
        return;
      }

      const student = result.data.student;
      setHasLoaded(true);
      setForm({
        firstName: student.firstName ?? "",
        lastName: student.lastName ?? "",
        levelId: student.level?.id ?? "",
        grade: student.grade ?? "",
        notes: student.notes ?? "",
        isActive: student.status === "ACTIVE",
      });
    } finally {
      setIsLoading(false);
    }
  }, [studentId, t]);

  const loadLevels = useCallback(async () => {
    const result = await fetchJson<LevelOption[]>("/api/levels");
    if (result.ok) {
      setLevels(result.data);
    } else {
      setLevels([]);
    }
  }, []);

  const loadParents = useCallback(async () => {
    setIsParentsLoading(true);
    setParentsError(null);

    try {
      const result = await fetchJson<{ parents: ParentLink[] }>(
        `/api/students/${studentId}/parents`,
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setParentsError(t("admin.students.parents.error"));
        return;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to load parents", result.details);
        setParentsError(t("common.error"));
        return;
      }

      if (!result.ok) {
        setParentsError(t("admin.students.parents.error"));
        return;
      }

      setParents(result.data.parents);
    } finally {
      setIsParentsLoading(false);
    }
  }, [studentId, t]);

  useEffect(() => {
    void loadStudent();
    void loadLevels();
    void loadParents();
  }, [loadStudent, loadLevels, loadParents]);

  useEffect(() => {
    return () => {
      // Clean up the copy toast timeout to avoid state updates after unmount.
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function handleSave() {
    if (isReadOnly) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const trimmedFirstName = form.firstName.trim();
    const trimmedLastName = form.lastName.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      setError(t("admin.students.detail.errorSaving"));
      setIsSaving(false);
      return;
    }

    const payload = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      levelId: form.levelId ? form.levelId : null,
      grade: form.grade.trim() ? form.grade.trim() : null,
      notes: form.notes.trim() ? form.notes.trim() : null,
      isActive: form.isActive,
    };

    const result = await fetchJson<{ student: StudentDetail }>(
      `/api/students/${studentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setError(t("admin.students.detail.errorSaving"));
      setIsSaving(false);
      return;
    }

    if (!result.ok && result.status === 0) {
      console.error("Failed to save student", result.details);
      setError(t("common.error"));
      setIsSaving(false);
      return;
    }

    if (!result.ok) {
      setError(t("admin.students.detail.errorSaving"));
      setIsSaving(false);
      return;
    }

    const updated = result.data.student;
    setForm({
      firstName: updated.firstName ?? "",
      lastName: updated.lastName ?? "",
      levelId: updated.level?.id ?? "",
      grade: updated.grade ?? "",
      notes: updated.notes ?? "",
      isActive: updated.status === "ACTIVE",
    });
    setMessage(t("admin.students.detail.saved"));
    setIsSaving(false);
  }

  const handleLinkParent = useCallback(async () => {
    setParentsError(null);
    setParentsMessage(null);

    const trimmedEmail = parentEmail.trim();
    if (!trimmedEmail) {
      setParentsError(t("admin.students.parents.error"));
      return;
    }

    const result = await fetchJson<{ link: ParentLink }>(
      `/api/students/${studentId}/parents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentEmail: trimmedEmail }),
      },
    );

    if (!result.ok && (result.status === 401 || result.status === 403)) {
      setParentsError(t("admin.students.parents.error"));
      return;
    }

    if (!result.ok && result.status === 0) {
      console.error("Failed to link parent", result.details);
      setParentsError(t("common.error"));
      return;
    }

    if (!result.ok) {
      setParentsError(t("admin.students.parents.error"));
      return;
    }

    setParentEmail("");
    await loadParents();
    setParentsMessage(t("admin.students.parents.linkedSuccess"));
  }, [loadParents, parentEmail, studentId, t]);

  const handleUnlinkParent = useCallback(
    async (parentId: string) => {
      setParentsError(null);
      setParentsMessage(null);

      const result = await fetchJson<{ ok: boolean }>(
        `/api/students/${studentId}/parents/${parentId}`,
        { method: "DELETE" },
      );

      if (!result.ok && (result.status === 401 || result.status === 403)) {
        setParentsError(t("admin.students.parents.error"));
        return;
      }

      if (!result.ok && result.status === 0) {
        console.error("Failed to unlink parent", result.details);
        setParentsError(t("common.error"));
        return;
      }

      if (!result.ok) {
        setParentsError(t("admin.students.parents.error"));
        return;
      }

      await loadParents();
      setParentsMessage(t("admin.students.parents.unlinkedSuccess"));
    },
    [loadParents, studentId, t],
  );

  const openResetModal = useCallback((link: ParentLink) => {
    // Reset flow starts in confirm state with clean error/result messaging.
    setResetTarget(link);
    setResetCode(null);
    setResetError(null);
    setHasCopiedCode(false);
  }, []);

  const closeResetModal = useCallback(() => {
    setResetTarget(null);
    setResetCode(null);
    setResetError(null);
    setIsResetting(false);
    setHasCopiedCode(false);
  }, []);

  const handleResetAccessCode = useCallback(async () => {
    if (!resetTarget) return;
    setIsResetting(true);
    setResetError(null);

    const result = await fetchJson<{
      accessCode: string;
    }>(`/api/parents/${resetTarget.parentId}/reset-access-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!result.ok) {
      setResetError(t("admin.parents.resetCode.error.generic"));
      setIsResetting(false);
      return;
    }

    setResetCode(result.data.accessCode);
    setIsResetting(false);
  }, [resetTarget, t]);

  const handleCopyResetCode = useCallback(async () => {
    if (!resetCode) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resetCode);
      } else {
        // Fallback for non-secure contexts or older browsers without Clipboard API.
        const textarea = document.createElement("textarea");
        textarea.value = resetCode;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error("Copy command was rejected");
        }
      }
      setHasCopiedCode(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setHasCopiedCode(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy parent access code", error);
    }
  }, [resetCode]);

  const parentsColumns: AdminTableColumn<ParentLink>[] = useMemo(
    () => [
      {
        header: t("admin.students.table.name"),
        cell: (link) => (
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">
              {formatParentName(link.parent)}
            </span>
            {link.parent.phone ? (
              <span className="text-xs text-slate-500">{link.parent.phone}</span>
            ) : null}
          </div>
        ),
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3",
      },
      {
        header: t("admin.students.parents.parentEmail"),
        cell: (link) => link.parent.email,
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3 text-slate-700",
      },
      {
        header: t("admin.students.table.actions"),
        cell: (link) => (
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              data-testid={`parent-reset-${link.parentId}`}
              disabled={isReadOnly}
              onClick={() => openResetModal(link)}
              type="button"
            >
              {t("admin.parents.resetCode.button")}
            </button>
            <button
              className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
              data-testid={`parent-unlink-${link.parentId}`}
              disabled={isReadOnly}
              onClick={() => handleUnlinkParent(link.parentId)}
              type="button"
            >
              {t("admin.students.parents.unlink")}
            </button>
          </div>
        ),
        headClassName: "px-4 py-3",
        cellClassName: "px-4 py-3",
      },
    ],
    [handleUnlinkParent, isReadOnly, openResetModal, t],
  );

  const loadingState = t("admin.students.messages.loading");

  if (isLoading) {
    return <p className="text-sm text-slate-600">{loadingState}</p>;
  }
  if (!hasLoaded && error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="grid gap-6">
      <section className="rounded border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("admin.students.detail.title")}
          </h2>
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            data-testid="student-detail-save"
            disabled={isSaving || isReadOnly}
            onClick={handleSave}
            type="button"
          >
            {isSaving
              ? t("admin.students.detail.saving")
              : t("admin.students.detail.save")}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {message ? (
          <p className="mt-3 text-sm text-green-600">{message}</p>
        ) : null}

        {/* AdminFormField keeps label spacing consistent with other admin editors. */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AdminFormField
            label={t("admin.students.fields.firstName")}
            htmlFor="student-first-name"
            required
          >
            <input
              className="rounded border border-slate-300 px-3 py-2"
              id="student-first-name"
              disabled={isReadOnly}
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
            htmlFor="student-last-name"
            required
          >
            <input
              className="rounded border border-slate-300 px-3 py-2"
              id="student-last-name"
              disabled={isReadOnly}
              value={form.lastName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, lastName: event.target.value }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.students.fields.grade")}
            htmlFor="student-grade"
          >
            <input
              className="rounded border border-slate-300 px-3 py-2"
              id="student-grade"
              disabled={isReadOnly}
              value={form.grade}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, grade: event.target.value }))
              }
            />
          </AdminFormField>
          <AdminFormField
            label={t("admin.students.fields.level")}
            htmlFor="student-level"
          >
            <select
              className="rounded border border-slate-300 px-3 py-2"
              id="student-level"
              disabled={isReadOnly}
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
            label={t("admin.students.fields.status")}
            htmlFor="student-active-toggle"
          >
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={form.isActive}
                className="h-4 w-4 rounded border-slate-300"
                data-testid="student-active-toggle"
                id="student-active-toggle"
                disabled={isReadOnly}
                onChange={() =>
                  setForm((prev) => ({ ...prev, isActive: !prev.isActive }))
                }
                type="checkbox"
              />
              <span>
                {form.isActive
                  ? t("admin.students.status.active")
                  : t("admin.students.status.inactive")}
              </span>
            </label>
          </AdminFormField>
          <AdminFormField
            label={t("admin.students.fields.notes")}
            htmlFor="student-notes"
            className="md:col-span-2"
          >
            <textarea
              className="min-h-[96px] rounded border border-slate-300 px-3 py-2"
              id="student-notes"
              disabled={isReadOnly}
              value={form.notes}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, notes: event.target.value }))
              }
            />
          </AdminFormField>
        </div>
      </section>

      {/* Wrapper adds a stable test id for parent linking E2E checks. */}
      <div data-testid="student-parents-section">
        <section
          className="rounded border border-slate-200 bg-white p-5"
          data-testid="parents-section"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.students.parents.title")}
            </h2>
          </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr]">
          <AdminFormField
            label={t("admin.students.parents.parentEmail")}
            htmlFor="parent-link-email"
          >
            <input
              className="rounded border border-slate-300 px-3 py-2"
              data-testid="parent-link-email"
              id="parent-link-email"
              disabled={isReadOnly}
              value={parentEmail}
              onChange={(event) => setParentEmail(event.target.value)}
            />
          </AdminFormField>
          <div className="flex items-end">
            <button
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              data-testid="parent-link-submit"
              disabled={isReadOnly}
              onClick={handleLinkParent}
              type="button"
            >
              {t("admin.students.parents.link")}
            </button>
          </div>
        </div>

        {parentsError ? (
          <p className="mt-3 text-sm text-red-600">{parentsError}</p>
        ) : null}
        {parentsMessage ? (
          <p className="mt-3 text-sm text-green-600">{parentsMessage}</p>
        ) : null}

        <div className="mt-4">
          <AdminTable
            rows={parents}
            columns={parentsColumns}
            rowKey={(link) => `parent-row-${link.parentId}`}
            testId="parents-table"
            isLoading={isParentsLoading}
            loadingState={loadingState}
            emptyState={t("admin.students.parents.empty")}
          />
        </div>
        </section>
      </div>

      {resetTarget ? (
        // Reuse the existing admin modal shell instead of shadcn Dialog for consistency.
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded border border-slate-200 bg-white p-6 shadow-xl">
            <AdminModalShell
              title={t("admin.parents.resetCode.title")}
              footer={
                resetCode ? (
                  <>
                    <button
                      className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                      data-testid="parent-reset-close"
                      onClick={closeResetModal}
                      type="button"
                    >
                      {t("actions.close")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                      data-testid="parent-reset-cancel"
                      disabled={isResetting}
                      onClick={closeResetModal}
                      type="button"
                    >
                      {t("actions.cancel")}
                    </button>
                    <button
                      className="flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      data-testid="parent-reset-confirm"
                      disabled={isResetting}
                      onClick={handleResetAccessCode}
                      type="button"
                    >
                      {isResetting ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          {t("generic.loading")}
                        </>
                      ) : (
                        t("admin.parents.resetCode.confirmButton")
                      )}
                    </button>
                  </>
                )
              }
              testId="parent-reset-code-modal"
            >
              {resetError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {resetError}
                </div>
              ) : null}

              {resetCode ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("admin.parents.resetCode.successTitle")}
                  </p>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      {t("admin.parents.resetCode.codeLabel")}
                    </p>
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
                      {/* data-testid lets E2E read the generated code without parsing labels. */}
                      <span data-testid="parent-reset-code-value">
                      {resetCode}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="rounded border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      disabled={!resetCode}
                      onClick={handleCopyResetCode}
                      type="button"
                    >
                      {t("admin.parents.resetCode.copyButton")}
                    </button>
                    {hasCopiedCode ? (
                      <span className="text-xs text-green-600">
                        {t("admin.parents.resetCode.copiedToast")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600">
                    {t("admin.parents.resetCode.securityGuidance")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">
                    {t("admin.parents.resetCode.confirmBody")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {resetTarget.parent.email}
                  </p>
                </div>
              )}
            </AdminModalShell>
          </div>
        </div>
      ) : null}
    </div>
  );
}
