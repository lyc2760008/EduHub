"use client";

// Session notes client section fetches and saves staff-only and parent-visible notes.
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import AdminFormField from "@/components/admin/shared/AdminFormField";
import {
  inputBase,
  primaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { fetchJson } from "@/lib/api/fetchJson";

type SessionNotesPayload = {
  sessionId: string;
  notes: {
    internalNote: string | null;
    parentVisibleNote: string | null;
    homework?: string | null;
    nextSteps?: string | null;
    updatedAt: string;
    updatedByUserId: string;
  } | null;
};

type SessionNotesSectionProps = {
  sessionId: string;
  tenant: string;
};

export default function SessionNotesSection({
  sessionId,
  tenant,
}: SessionNotesSectionProps) {
  const t = useTranslations();
  const [internalNote, setInternalNote] = useState("");
  const [parentVisibleNote, setParentVisibleNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Use /t/<tenant>/api to ensure tenant resolution in path-based setups.
    const result = await fetchJson<SessionNotesPayload>(
      `/t/${tenant}/api/sessions/${sessionId}/notes`,
    );

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        setError(t("admin.sessions.messages.forbidden"));
      } else {
        setError(t("common.error"));
      }
      setInternalNote("");
      setParentVisibleNote("");
      setIsLoading(false);
      return;
    }

    setInternalNote(result.data.notes?.internalNote ?? "");
    setParentVisibleNote(result.data.notes?.parentVisibleNote ?? "");
    setIsLoading(false);
  }, [sessionId, t, tenant]);

  useEffect(() => {
    // Defer load to avoid setState directly in the effect body.
    const handle = setTimeout(() => {
      void loadNotes();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadNotes]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const normalizedInternal = internalNote.trim();
    const normalizedParentVisible = parentVisibleNote.trim();
    const payload = {
      internalNote: normalizedInternal.length ? normalizedInternal : null,
      parentVisibleNote: normalizedParentVisible.length
        ? normalizedParentVisible
        : null,
    };

    const result = await fetchJson<SessionNotesPayload>(
      `/t/${tenant}/api/sessions/${sessionId}/notes`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        setError(t("admin.sessions.messages.forbidden"));
      } else {
        setError(t("admin.sessions.notes.errorSaving"));
      }
      setIsSaving(false);
      return;
    }

    setInternalNote(result.data.notes?.internalNote ?? "");
    setParentVisibleNote(result.data.notes?.parentVisibleNote ?? "");
    setMessage(t("admin.sessions.notes.saved"));
    setIsSaving(false);
  }, [internalNote, parentVisibleNote, sessionId, t, tenant]);

  const internalId = "session-notes-internal";
  const parentVisibleId = "session-notes-parent-visible";
  const parentVisibleHintId = `${parentVisibleId}-hint`;

  return (
    <section
      className="rounded border border-slate-200 bg-white p-5"
      data-testid="notes-section"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("admin.sessions.notes.sectionTitle")}
        </h2>
        <button
          className={primaryButton}
          // E2E selector keeps notes save behavior stable without relying on copy.
          data-testid="notes-save-button"
          disabled={isLoading || isSaving}
          onClick={() => void handleSave()}
          type="button"
        >
          {isSaving
            ? t("admin.sessions.notes.saving")
            : t("admin.sessions.notes.save")}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600" data-testid="notes-save-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          className="mt-3 text-sm text-green-600"
          data-testid="notes-saved-toast"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4">
        <AdminFormField
          label={t("admin.sessions.notes.internalLabel")}
          htmlFor={internalId}
          // Wrapper test id helps target the field group when needed.
          testId="notes-internal"
        >
          <textarea
            id={internalId}
            className={`${inputBase} min-h-[120px] resize-y`}
            data-testid="notes-internal-input"
            value={internalNote}
            disabled={isLoading || isSaving}
            onChange={(event) => {
              setMessage(null);
              setInternalNote(event.target.value);
            }}
          />
        </AdminFormField>

        <AdminFormField
          label={t("admin.sessions.notes.parentVisibleLabel")}
          htmlFor={parentVisibleId}
          hint={t("admin.sessions.notes.parentVisibleHint")}
          // Wrapper test id keeps the parent-visible group stable for E2E.
          testId="notes-parent-visible"
        >
          <textarea
            id={parentVisibleId}
            className={`${inputBase} min-h-[120px] resize-y`}
            data-testid="notes-parent-visible-input"
            value={parentVisibleNote}
            disabled={isLoading || isSaving}
            aria-describedby={parentVisibleHintId}
            onChange={(event) => {
              setMessage(null);
              setParentVisibleNote(event.target.value);
            }}
          />
        </AdminFormField>
      </div>
    </section>
  );
}
