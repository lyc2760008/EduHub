"use client";

// Tutor Run Session page fetches roster attendance and saves parent-visible execution updates.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTimeRange, getSessionTypeLabelKey } from "@/lib/portal/format";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type TutorRunSessionResponse = {
  session: {
    sessionId: string;
    startDateTime: string;
    endDateTime: string;
    timezone: string;
    label: string;
    locationLabel: string | null;
    sessionType: string;
  };
  roster: Array<{
    studentId: string;
    displayName: string;
    attendanceStatus: AttendanceStatus | null;
    parentVisibleNote: string | null;
  }>;
  requestId?: string;
};

type SaveResponse = {
  ok: true;
  requestId?: string;
};

type RosterRow = {
  studentId: string;
  displayName: string;
  attendanceStatus: AttendanceStatus;
  parentVisibleNote: string;
};

type TutorRunSessionPageClientProps = {
  tenant: string;
  sessionId: string;
};

// --- DESIGNER UI CONTRACT PLACEHOLDER ---
// [PASTE DESIGNER UI CONTRACT HERE]
// --- END DESIGNER UI CONTRACT PLACEHOLDER ---

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; key: string }> = [
  { value: "PRESENT", key: "tutorRunSession.attendance.present" },
  { value: "ABSENT", key: "tutorRunSession.attendance.absent" },
  { value: "LATE", key: "tutorRunSession.attendance.late" },
  { value: "EXCUSED", key: "tutorRunSession.attendance.excused" },
];

export default function TutorRunSessionPageClient({
  tenant,
  sessionId,
}: TutorRunSessionPageClientProps) {
  const t = useTranslations();
  const locale = useLocale();

  const [session, setSession] = useState<TutorRunSessionResponse["session"] | null>(
    null,
  );
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [toastKey, setToastKey] = useState<
    | "tutorRunSession.save.toast.success"
    | "tutorRunSession.save.toast.error"
    | null
  >(null);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);

    const result = await fetchJson<TutorRunSessionResponse>(
      `/${tenant}/api/tutor/sessions/${sessionId}`,
    );

    if (!result.ok) {
      setHasLoadError(true);
      setIsLoading(false);
      return;
    }

    setSession(result.data.session);
    setRows(
      result.data.roster.map((row) => ({
        studentId: row.studentId,
        displayName: row.displayName,
        // Default to Present when attendance is not yet marked.
        attendanceStatus: row.attendanceStatus ?? "PRESENT",
        parentVisibleNote: row.parentVisibleNote ?? "",
      })),
    );
    setIsLoading(false);
  }, [sessionId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSession();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSession]);

  useEffect(() => {
    if (!toastKey) return;
    const timer = setTimeout(() => setToastKey(null), 2500);
    return () => clearTimeout(timer);
  }, [toastKey]);

  const summaryLine = useMemo(() => {
    if (!session) return "";
    const dateTimeLabel =
      formatPortalDateTimeRange(
        session.startDateTime,
        session.endDateTime,
        locale,
        session.timezone,
      ) || "";
    const typeLabelKey = getSessionTypeLabelKey(session.sessionType);
    const sessionLabel =
      session.label?.trim() || (typeLabelKey ? t(typeLabelKey) : t("generic.dash"));
    const parts = [dateTimeLabel, sessionLabel];
    if (session.locationLabel?.trim()) {
      parts.push(session.locationLabel);
    }
    return parts.filter(Boolean).join(" • ");
  }, [locale, session, t]);

  const saveSession = useCallback(async () => {
    setIsSaving(true);
    setSaveState("idle");

    const result = await fetchJson<SaveResponse>(
      `/${tenant}/api/tutor/sessions/${sessionId}/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: rows.map((row) => ({
            studentId: row.studentId,
            attendanceStatus: row.attendanceStatus,
            parentVisibleNote: row.parentVisibleNote.trim() || null,
          })),
        }),
      },
    );

    if (!result.ok) {
      setSaveState("error");
      setToastKey("tutorRunSession.save.toast.error");
      setIsSaving(false);
      return;
    }

    setSaveState("saved");
    setToastKey("tutorRunSession.save.toast.success");
    setIsSaving(false);
  }, [rows, sessionId, tenant]);

  if (isLoading) {
    return (
      <section className="space-y-4" data-testid="tutor-run-session-loading">
        <div className="h-7 w-44 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`run-session-loading-${index}`}
            className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white"
          />
        ))}
      </section>
    );
  }

  if (hasLoadError || !session) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5" data-testid="tutor-run-session-error">
        <p className="text-base font-semibold text-slate-900">
          {t("tutorRunSession.error.load.title")}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {t("tutorRunSession.error.load.body")}
        </p>
        <button
          type="button"
          onClick={() => void loadSession()}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
          data-testid="tutor-run-session-retry"
        >
          {t("tutorRunSession.error.load.retry")}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-24" data-testid="tutor-run-session-page">
      <header className="space-y-2">
        <Link
          href={`/${tenant}/tutor/sessions`}
          className="inline-flex items-center text-sm font-semibold text-slate-700 hover:text-slate-900"
          data-testid="tutor-run-session-back"
        >
          {t("tutorRunSession.page.back")}
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("tutorRunSession.page.title")}
        </h1>
        <p className="text-sm text-slate-600">{summaryLine}</p>
      </header>

      {rows.length === 0 ? (
        <section
          className="rounded-lg border border-slate-200 bg-white p-5"
          data-testid="tutor-run-session-empty"
        >
          <p className="text-base font-semibold text-slate-900">
            {t("tutorRunSession.emptyRoster.title")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("tutorRunSession.emptyRoster.body")}
          </p>
        </section>
      ) : (
        <section className="space-y-3" data-testid="tutor-run-session-roster">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("tutorRunSession.roster.sectionTitle")}
          </h2>
          {rows.map((row) => (
            <article
              key={row.studentId}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
              data-testid={`tutor-run-session-row-${row.studentId}`}
            >
              <p className="text-sm font-semibold text-slate-900">{row.displayName}</p>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-slate-600">
                  {t("tutorRunSession.roster.status.label")}
                </span>
                <select
                  value={row.attendanceStatus}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((entry) =>
                        entry.studentId === row.studentId
                          ? {
                              ...entry,
                              attendanceStatus: event.target.value as AttendanceStatus,
                            }
                          : entry,
                      ),
                    )
                  }
                  disabled={isSaving}
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-60"
                  data-testid={`tutor-run-session-status-${row.studentId}`}
                >
                  {ATTENDANCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.key)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium text-slate-600">
                  {t("tutorRunSession.note.parentVisible.label")}
                </span>
                <textarea
                  value={row.parentVisibleNote}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((entry) =>
                        entry.studentId === row.studentId
                          ? { ...entry, parentVisibleNote: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  disabled={isSaving}
                  rows={3}
                  className="min-h-[92px] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-60"
                  data-testid={`tutor-run-session-note-${row.studentId}`}
                />
                <span className="text-xs text-slate-500">
                  {t("tutorRunSession.note.parentVisible.helper")}
                </span>
              </label>
            </article>
          ))}
        </section>
      )}

      {saveState === "error" ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
          data-testid="tutor-run-session-save-error"
        >
          <p className="text-sm font-semibold text-red-700">
            {t("tutorRunSession.save.toast.error")}
          </p>
          <p className="text-xs text-red-700">{t("tutorRunSession.save.error.body")}</p>
        </div>
      ) : null}

      {/* Sticky save bar keeps the primary action visible on small screens. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="text-sm text-slate-600" data-testid="tutor-run-session-save-state">
            {isSaving
              ? t("tutorRunSession.save.saving")
              : saveState === "saved"
                ? t("tutorRunSession.save.saved")
                : saveState === "error"
                  ? t("tutorRunSession.save.error.body")
                  : ""}
          </div>
          <button
            type="button"
            onClick={() => void saveSession()}
            disabled={isSaving || rows.length === 0}
            className="inline-flex h-11 min-w-[120px] items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-60"
            data-testid="tutor-run-session-save"
          >
            {isSaving ? t("tutorRunSession.save.saving") : t("tutorRunSession.save.cta")}
          </button>
        </div>
      </div>

      {toastKey ? (
        <div
          className="fixed right-4 top-4 z-40 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          role="status"
          data-testid="tutor-run-session-toast"
        >
          {t(toastKey)}
        </div>
      ) : null}
    </section>
  );
}
