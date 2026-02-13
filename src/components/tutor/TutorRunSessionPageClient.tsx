"use client";

// Tutor Run Session page fetches roster attendance and saves parent-visible execution updates.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { fetchJson } from "@/lib/api/fetchJson";
import { secondaryButton } from "@/components/admin/shared/adminUiClasses";
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
    zoomLink: string | null;
  };
  roster: Array<{
    studentId: string;
    displayName: string;
    attendanceStatus: AttendanceStatus | null;
    parentVisibleNote: string | null;
  }>;
  requestId?: string;
};

type SessionResourceType = "HOMEWORK" | "WORKSHEET" | "VIDEO" | "OTHER";

type SessionResourceItem = {
  id: string;
  title: string;
  url: string;
  type: SessionResourceType;
  updatedAt: string;
};

type SessionResourcesResponse = {
  items: SessionResourceItem[];
};

type CreateResourceResponse = {
  item: SessionResourceItem;
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

type ResourceFormState = {
  title: string;
  url: string;
  type: SessionResourceType;
};

type ResourceFormErrors = Partial<Record<keyof ResourceFormState, string>>;

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; key: string }> = [
  { value: "PRESENT", key: "tutorRunSession.attendance.present" },
  { value: "ABSENT", key: "tutorRunSession.attendance.absent" },
  { value: "LATE", key: "tutorRunSession.attendance.late" },
  { value: "EXCUSED", key: "tutorRunSession.attendance.excused" },
];

const RESOURCE_TYPE_OPTIONS: SessionResourceType[] = [
  "HOMEWORK",
  "WORKSHEET",
  "VIDEO",
  "OTHER",
];

const EMPTY_RESOURCE_FORM: ResourceFormState = {
  title: "",
  url: "",
  type: "HOMEWORK",
};

function getResourceTypeLabelKey(type: SessionResourceType) {
  if (type === "HOMEWORK") return "sessionResources.type.homework";
  if (type === "WORKSHEET") return "sessionResources.type.worksheet";
  if (type === "VIDEO") return "sessionResources.type.video";
  return "sessionResources.type.other";
}

function isValidResourceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
  const [resources, setResources] = useState<SessionResourceItem[]>([]);
  const [isResourcesLoading, setIsResourcesLoading] = useState(true);
  const [hasResourcesLoadError, setHasResourcesLoadError] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState<ResourceFormState>(
    EMPTY_RESOURCE_FORM,
  );
  const [resourceFormErrors, setResourceFormErrors] = useState<ResourceFormErrors>(
    {},
  );
  const [isResourceSaving, setIsResourceSaving] = useState(false);

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

  const loadResources = useCallback(async () => {
    setIsResourcesLoading(true);
    setHasResourcesLoadError(false);

    const result = await fetchJson<SessionResourcesResponse>(
      `/${tenant}/api/tutor/sessions/${sessionId}/resources`,
    );

    if (!result.ok) {
      setResources([]);
      setHasResourcesLoadError(true);
      setIsResourcesLoading(false);
      return;
    }

    setResources(result.data.items ?? []);
    setIsResourcesLoading(false);
  }, [sessionId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSession();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSession]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadResources();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadResources]);

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

  const validateResourceForm = useCallback(
    (value: ResourceFormState) => {
      const errors: ResourceFormErrors = {};
      if (!value.title.trim()) {
        errors.title = t("sessionResources.validation.titleRequired");
      }
      if (!value.url.trim()) {
        errors.url = t("sessionResources.validation.urlRequired");
      } else if (!isValidResourceUrl(value.url)) {
        errors.url = t("sessionResources.validation.invalidUrl");
      }
      if (!value.type) {
        errors.type = t("sessionResources.type.label");
      }
      return errors;
    },
    [t],
  );

  const closeResourceModal = useCallback(() => {
    if (isResourceSaving) return;
    setIsResourceModalOpen(false);
    setResourceForm(EMPTY_RESOURCE_FORM);
    setResourceFormErrors({});
  }, [isResourceSaving]);

  const submitResource = useCallback(async () => {
    const errors = validateResourceForm(resourceForm);
    setResourceFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsResourceSaving(true);

    const result = await fetchJson<CreateResourceResponse>(
      `/${tenant}/api/tutor/sessions/${sessionId}/resources`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resourceForm.title.trim(),
          url: resourceForm.url.trim(),
          type: resourceForm.type,
        }),
      },
    );

    if (!result.ok) {
      setIsResourceSaving(false);
      setHasResourcesLoadError(true);
      return;
    }

    setIsResourceSaving(false);
    closeResourceModal();
    await loadResources();
  }, [closeResourceModal, loadResources, resourceForm, sessionId, tenant, validateResourceForm]);

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
        {session.zoomLink?.trim() ? (
          <a
            className="text-sm font-semibold text-slate-700 underline"
            href={session.zoomLink}
            rel="noreferrer"
            target="_blank"
          >
            {t("session.zoomLink.open")}
          </a>
        ) : null}
      </header>

      <section
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        data-testid="tutor-run-session-resources"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("sessionResources.section.title")}
          </h2>
          <button
            type="button"
            className={`${secondaryButton} px-3 py-1 text-xs`}
            onClick={() => setIsResourceModalOpen(true)}
            disabled={isResourceSaving}
          >
            {t("sessionResources.add")}
          </button>
        </div>

        {isResourcesLoading ? (
          <p className="text-sm text-slate-500">{t("sessionResources.loading")}</p>
        ) : hasResourcesLoadError ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-red-700">
              {t("sessionResources.error.title")}
            </p>
            <p className="text-sm text-slate-600">{t("sessionResources.error.body")}</p>
            <button
              type="button"
              className={`${secondaryButton} px-3 py-1 text-xs`}
              onClick={() => void loadResources()}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : resources.length === 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">
              {t("sessionResources.empty.admin.title")}
            </p>
            <p className="text-sm text-slate-500">
              {t("sessionResources.empty.admin.helper")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {resources.map((item) => (
              <li
                key={item.id}
                className="rounded border border-slate-200 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {t(getResourceTypeLabelKey(item.type))}
                  </span>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                </div>
                <a
                  className="mt-1 inline-flex text-sm font-semibold text-slate-700 underline"
                  href={item.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("sessionResources.openLink")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      {isResourceModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="tutor-run-session-resource-modal"
        >
          <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              {t("sessionResources.add")}
            </h3>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-sm text-slate-700">
                <span>{t("sessionResources.type.label")}</span>
                <select
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
                  value={resourceForm.type}
                  disabled={isResourceSaving}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      type: event.target.value as SessionResourceType,
                    }))
                  }
                >
                  {RESOURCE_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {t(getResourceTypeLabelKey(type))}
                    </option>
                  ))}
                </select>
                {resourceFormErrors.type ? (
                  <p className="text-xs text-red-600">{resourceFormErrors.type}</p>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span>{t("sessionResources.title.label")}</span>
                <input
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
                  value={resourceForm.title}
                  disabled={isResourceSaving}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                {resourceFormErrors.title ? (
                  <p className="text-xs text-red-600">{resourceFormErrors.title}</p>
                ) : null}
              </label>

              <label className="grid gap-1 text-sm text-slate-700">
                <span>{t("sessionResources.url.label")}</span>
                <input
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
                  value={resourceForm.url}
                  disabled={isResourceSaving}
                  onChange={(event) =>
                    setResourceForm((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
                {resourceFormErrors.url ? (
                  <p className="text-xs text-red-600">{resourceFormErrors.url}</p>
                ) : null}
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                className={secondaryButton}
                onClick={closeResourceModal}
                disabled={isResourceSaving}
              >
                {t("sessionResources.deleteConfirm.cancel")}
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void submitResource()}
                disabled={isResourceSaving}
              >
                {isResourceSaving ? t("common.loading") : t("common.actions.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
