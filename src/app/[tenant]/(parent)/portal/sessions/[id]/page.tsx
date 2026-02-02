"use client";

// Parent portal session detail page with per-student attendance and notes.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  formatPortalDateTime,
  getAttendanceStatusLabelKey,
  getSessionTypeLabelKey,
} from "@/lib/portal/format";

type PortalSessionDetail = {
  id: string;
  sessionType: string;
  startAt: string;
  endAt: string;
  timezone: string;
  groupId?: string | null;
  groupName?: string | null;
  centerId?: string | null;
  centerName?: string | null;
  tutor?: { id?: string | null; name?: string | null } | null;
};

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  level?: { id: string; name: string } | null;
};

type PortalAttendance = {
  id: string;
  status: string;
  parentVisibleNote?: string | null;
  markedAt?: string | null;
} | null;

type PortalRequestSummary = {
  id: string;
  type: string;
  status: string;
  createdAt?: string | null;
  resolvedAt?: string | null;
} | null;

type PortalRequestDetail = {
  id: string;
  type: string;
  status: string;
  reasonCode: string;
  message?: string | null;
  sessionId: string;
  studentId: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
};

type PortalSessionDetailResponse = {
  session: PortalSessionDetail;
  students: Array<{
    student: PortalStudent;
    attendance: PortalAttendance;
    request: PortalRequestSummary;
  }>;
};

type PortalRequestsResponse = {
  items: PortalRequestDetail[];
};

const ABSENCE_REASON_OPTIONS = [
  { value: "ILLNESS", labelKey: "portal.absence.reason.illness" },
  { value: "TRAVEL", labelKey: "portal.absence.reason.travel" },
  { value: "FAMILY", labelKey: "portal.absence.reason.family" },
  { value: "SCHOOL_CONFLICT", labelKey: "portal.absence.reason.schoolConflict" },
  { value: "OTHER", labelKey: "portal.absence.reason.other" },
];

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function formatSessionDateTime(
  startAt: string,
  endAt: string,
  locale: string,
) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const timeRange = `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;

  return `${dateLabel} ${timeRange}`;
}

function formatSessionDuration(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  // Use HH:MM to avoid adding new localized duration copy outside the contract.
  return `${hours}:${String(remainder).padStart(2, "0")}`;
}

function getRequestStatusLabelKey(status: string | null | undefined) {
  switch (status) {
    case "PENDING":
      return "portal.absence.status.pending";
    case "APPROVED":
      return "portal.absence.status.approved";
    case "DECLINED":
      return "portal.absence.status.declined";
    default:
      return "generic.dash";
  }
}

function getRequestStatusHelperKey(status: string | null | undefined) {
  switch (status) {
    case "PENDING":
      return "portal.absence.status.pendingHelper";
    case "APPROVED":
      return "portal.absence.status.approvedHelper";
    case "DECLINED":
      return "portal.absence.status.declinedHelper";
    default:
      return null;
  }
}

function getRequestStatusTone(status: string | null | undefined) {
  switch (status) {
    case "APPROVED":
      return "border-[var(--success)] text-[var(--success)]";
    case "DECLINED":
      return "border-[var(--destructive)] text-[var(--destructive)]";
    case "PENDING":
      return "border-[var(--warning)] text-[var(--warning)]";
    default:
      return "border-[var(--border)] text-[var(--muted)]";
  }
}

function resolveReasonLabelKey(reasonCode: string | null | undefined) {
  if (!reasonCode) return "generic.dash";
  const match = ABSENCE_REASON_OPTIONS.find((option) => option.value === reasonCode);
  return match?.labelKey ?? "generic.dash";
}

export default function PortalSessionDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ tenant?: string; id?: string }>();
  const router = useRouter();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  const sessionId = typeof params.id === "string" ? params.id : "";

  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<PortalSessionDetailResponse | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestMode, setRequestMode] = useState<"create" | "view">("create");
  const [requestReason, setRequestReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestToast, setRequestToast] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<PortalRequestDetail | null>(null);
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const [isUpcomingSession, setIsUpcomingSession] = useState(false);

  const loadSession = useCallback(async () => {
    if (!tenant || !sessionId) return;
    setIsLoading(true);
    setNotFound(false);
    setRequestToast(null);

    const result = await fetchJson<PortalSessionDetailResponse>(
      buildPortalApiUrl(tenant, `/sessions/${sessionId}`),
    );

    if (!result.ok) {
      // Non-leaky not-found state covers missing sessions and access denial.
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    setSessionDetail(result.data);
    // Upcoming eligibility is resolved once per load to avoid impure render calls.
    setIsUpcomingSession(
      new Date(result.data.session.startAt).getTime() > Date.now(),
    );
    // Seed the active student once data arrives without a separate effect.
    if (result.data.students.length) {
      setActiveStudentId((current) => current ?? result.data.students[0].student.id);
    }
    setIsLoading(false);
  }, [sessionId, tenant]);

  const loadRequestDetail = useCallback(
    async (sessionTarget: string, studentTarget: string) => {
      if (!tenant) return;
      const params = new URLSearchParams({ take: "100", skip: "0" });
      const result = await fetchJson<PortalRequestsResponse>(
        buildPortalApiUrl(tenant, "/requests", params),
      );
      if (!result.ok) {
        setRequestDetail(null);
        return;
      }
      const match = result.data.items.find(
        (item) => item.sessionId === sessionTarget && item.studentId === studentTarget,
      );
      setRequestDetail(match ?? null);
    },
    [tenant],
  );

  const closeRequestModal = useCallback(() => {
    setIsRequestModalOpen(false);
    setRequestError(null);
    setRequestMode("create");
  }, []);

  const openRequestModal = useCallback(
    (mode: "create" | "view", sessionTarget: string, studentTarget: string) => {
      setRequestMode(mode);
      setIsRequestModalOpen(true);
      setRequestError(null);
      if (mode === "create") {
        setRequestReason("");
        setRequestMessage("");
        return;
      }
      // Load request details on demand to keep initial payloads small.
      void loadRequestDetail(sessionTarget, studentTarget);
    },
    [loadRequestDetail],
  );

  const handleSubmitRequest = useCallback(async () => {
    if (!tenant || !sessionId || !activeStudentId) return;
    if (!requestReason) {
      setRequestError("validation");
      return;
    }

    setIsRequestSubmitting(true);
    setRequestError(null);

    const payload = {
      sessionId,
      studentId: activeStudentId,
      reasonCode: requestReason,
      message: requestMessage.trim() ? requestMessage.trim() : undefined,
    };

    const result = await fetchJson<{ request: PortalRequestDetail }>(
      buildPortalApiUrl(tenant, "/requests"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!result.ok) {
      setRequestError("submit");
      setIsRequestSubmitting(false);
      return;
    }

    setIsRequestSubmitting(false);
    setIsRequestModalOpen(false);
    setRequestToast(t("portal.absence.state.submittedToast"));
    setRequestDetail(result.data.request);
    void loadSession();
  }, [
    activeStudentId,
    loadSession,
    requestMessage,
    requestReason,
    sessionId,
    t,
    tenant,
  ]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSession();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSession]);

  useEffect(() => {
    // Reset cached request details when switching students or sessions.
    const handle = setTimeout(() => {
      setRequestDetail(null);
      setRequestError(null);
    }, 0);
    return () => clearTimeout(handle);
  }, [activeStudentId, sessionId]);

  const backHref = tenant ? `/${tenant}/portal/sessions` : "/portal/sessions";

  const handleBack = useCallback(() => {
    // Fall back to the sessions list when there is no navigation history.
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }, [backHref, router]);

  const activeEntry = useMemo(() => {
    if (!sessionDetail?.students.length) return null;
    return (
      sessionDetail.students.find(
        (entry) => entry.student.id === activeStudentId,
      ) ?? sessionDetail.students[0]
    );
  }, [activeStudentId, sessionDetail]);

  const session = sessionDetail?.session ?? null;
  const sessionTypeKey = session ? getSessionTypeLabelKey(session.sessionType) : null;
  const sessionTypeLabel = sessionTypeKey ? t(sessionTypeKey) : t("generic.dash");
  const sessionTitle = session?.groupName?.trim() || sessionTypeLabel;
  const showTypeBadge = Boolean(session?.groupName?.trim());

  const attendance = activeEntry?.attendance ?? null;
  const attendanceStatusKey = attendance
    ? getAttendanceStatusLabelKey(attendance.status)
    : null;
  const attendanceLabel = attendanceStatusKey ? t(attendanceStatusKey) : t("generic.dash");
  const attendanceToneClassName = attendanceStatusKey
    ? "border-[var(--info)] text-[var(--info)]"
    : "border-[var(--border)] text-[var(--muted)]";
  const parentNote = attendance?.parentVisibleNote?.trim() ?? "";
  const requestSummary = activeEntry?.request ?? null;
  const requestStatusKey = getRequestStatusLabelKey(requestSummary?.status);
  const requestStatusLabel = t(requestStatusKey);
  const requestStatusToneClassName = getRequestStatusTone(requestSummary?.status);
  const requestHelperKey = getRequestStatusHelperKey(requestSummary?.status);
  const requestHelperLabel = requestHelperKey ? t(requestHelperKey) : "";
  const attendanceActionLabel = attendanceStatusKey
    ? attendanceLabel
    : isUpcomingSession
      ? t("portal.absence.status.upcoming")
      : t("generic.dash");

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-session-detail-loading">
        <PortalSkeletonBlock className="h-6 w-40" />
        <PortalSkeletonBlock className="h-8 w-56" />
        <Card>
          <div className="space-y-3">
            <PortalSkeletonBlock className="h-5 w-32" />
            {Array.from({ length: 6 }).map((_, index) => (
              <PortalSkeletonBlock key={index} className="h-4 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <PortalSkeletonBlock className="h-5 w-28" />
          <PortalSkeletonBlock className="mt-3 h-6 w-40" />
        </Card>
      </div>
    );
  }

  if (notFound || !sessionDetail || !session) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-session-detail-not-found">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.sessionDetail.error.notFound.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.sessionDetail.error.notFound.body")}
          </p>
          <Link
            href={backHref}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.sessionDetail.error.notFound.cta")}
          </Link>
        </div>
      </Card>
    );
  }

  const dateTimeLabel = formatSessionDateTime(
    session.startAt,
    session.endAt,
    locale,
  );
  const durationLabel = formatSessionDuration(session.startAt, session.endAt);

  return (
    <div className="space-y-6" data-testid="portal-session-detail-page">
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] md:hidden"
        >
          <span aria-hidden="true">&lt;</span>
          {t("portal.nav.sessions")}
        </button>
        <div className="hidden items-center gap-2 text-sm text-[var(--muted)] md:flex">
          <Link href={backHref} className="text-[var(--primary)]">
            {t("portal.nav.sessions")}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{t("portal.sessionDetail.title")}</span>
        </div>
        <PageHeader titleKey="portal.sessionDetail.title" />
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              {sessionTitle}
            </h2>
            {showTypeBadge ? (
              <span className="rounded-full border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                {sessionTypeLabel}
              </span>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("portal.sessionDetail.section.details")}
            </div>
            <div className="space-y-3">
              <div className="grid gap-1 md:grid-cols-[160px_1fr] md:items-center">
                <span className="text-sm text-[var(--muted)]">
                  {t("portal.sessionDetail.field.dateTime")}
                </span>
                <span className="text-sm text-[var(--text)]">
                  {dateTimeLabel ||
                    formatPortalDateTime(session.startAt, locale) ||
                    t("generic.dash")}
                </span>
              </div>
              <div className="grid gap-1 md:grid-cols-[160px_1fr] md:items-center">
                <span className="text-sm text-[var(--muted)]">
                  {t("portal.sessionDetail.field.duration")}
                </span>
                <span className="text-sm text-[var(--text)]">
                  {durationLabel || t("generic.dash")}
                </span>
              </div>
              <div className="grid gap-1 md:grid-cols-[160px_1fr] md:items-center">
                <span className="text-sm text-[var(--muted)]">
                  {t("portal.sessionDetail.field.students")}
                </span>
                <div className="flex flex-wrap gap-2">
                  {sessionDetail.students.map((entry) => (
                    <Link
                      key={entry.student.id}
                      href={
                        tenant
                          ? `/${tenant}/portal/students/${entry.student.id}`
                          : `/portal/students/${entry.student.id}`
                      }
                      className="text-sm text-[var(--primary)]"
                    >
                      {entry.student.firstName} {entry.student.lastName}
                    </Link>
                  ))}
                </div>
              </div>
              {session.tutor?.name ? (
                <div className="grid gap-1 md:grid-cols-[160px_1fr] md:items-center">
                  <span className="text-sm text-[var(--muted)]">
                    {t("portal.sessionDetail.field.tutor")}
                  </span>
                  <span className="text-sm text-[var(--text)]">
                    {session.tutor.name}
                  </span>
                </div>
              ) : null}
              {session.centerName ? (
                <div className="grid gap-1 md:grid-cols-[160px_1fr] md:items-center">
                  <span className="text-sm text-[var(--muted)]">
                    {t("portal.sessionDetail.field.center")}
                  </span>
                  <span className="text-sm text-[var(--text)]">
                    {session.centerName}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {sessionDetail.students.length > 1 ? (
        <div className="flex flex-wrap gap-2" data-testid="portal-session-student-switch">
          {sessionDetail.students.map((entry) => {
            const isActive = entry.student.id === activeEntry?.student.id;
            const baseClassName =
              "rounded-full border px-3 py-1 text-xs font-medium transition";
            const toneClassName = isActive
              ? "border-[var(--primary)] bg-[var(--surface-2)] text-[var(--text)]"
              : "border-[var(--border)] text-[var(--muted)]";
            return (
              <button
                key={entry.student.id}
                type="button"
                onClick={() => setActiveStudentId(entry.student.id)}
                className={`${baseClassName} ${toneClassName}`}
              >
                {entry.student.firstName}
              </button>
            );
          })}
        </div>
      ) : null}

      <Card>
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.sessionDetail.section.attendance")}
          </h2>

          {requestToast ? (
            <div
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]"
              data-testid="portal-absence-toast"
            >
              {requestToast}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${attendanceToneClassName}`}
              data-testid="portal-attendance-status-chip"
            >
              {attendanceActionLabel}
            </span>
            {isUpcomingSession && !requestSummary && activeEntry ? (
              <button
                type="button"
                onClick={() =>
                  openRequestModal("create", session.id, activeEntry.student.id)
                }
                className="inline-flex h-9 items-center rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
                data-testid="portal-absence-cta"
              >
                {t("portal.absence.cta.report")}
              </button>
            ) : null}
            {!isUpcomingSession && !requestSummary ? (
              <span
                className="text-xs text-[var(--muted)]"
                data-testid="portal-absence-ineligible"
              >
                {t("portal.absence.ineligible.past")}
              </span>
            ) : null}
            {requestSummary && activeEntry ? (
              <button
                type="button"
                onClick={() =>
                  openRequestModal("view", session.id, activeEntry.student.id)
                }
                className="text-xs font-semibold text-[var(--primary)]"
                data-testid="portal-absence-view-link"
              >
                {t("portal.absence.action.view")}
              </button>
            ) : null}
          </div>

          {requestSummary ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {t("portal.absence.status.label")}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${requestStatusToneClassName}`}
                  // Status chip needs a stable test hook for absence request assertions.
                  data-testid="portal-absence-status-chip"
                >
                  {requestStatusLabel}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-[var(--muted)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--muted)]">
                    {t("portal.absence.status.submittedAt")}
                  </span>
                  <span>
                    {requestSummary.createdAt
                      ? formatPortalDateTime(requestSummary.createdAt, locale) ||
                        t("generic.dash")
                      : t("generic.dash")}
                  </span>
                </div>
                {requestSummary.resolvedAt ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--muted)]">
                      {t("portal.absence.status.updatedAt")}
                    </span>
                    <span>
                      {formatPortalDateTime(requestSummary.resolvedAt, locale) ||
                        t("generic.dash")}
                    </span>
                  </div>
                ) : null}
              </div>
              {requestHelperLabel ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {requestHelperLabel}
                </p>
              ) : null}
            </div>
          ) : null}

          {!attendance ? (
            <p className="text-sm text-[var(--muted)]">
              {t("portal.sessionDetail.attendance.pending")}
            </p>
          ) : null}
        </div>
      </Card>

      {parentNote ? (
        <Card>
          <div className="space-y-3" data-testid="portal-session-parent-note">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("portal.sessionDetail.section.parentNote")}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {t("portal.sessionDetail.parentNote.helper")}
            </p>
            <p
              className="whitespace-pre-line text-sm text-[var(--text)]"
              // Parent note body gets a dedicated test hook for stable assertions.
              data-testid="portal-session-parent-note-body"
            >
              {parentNote}
            </p>
          </div>
        </Card>
      ) : (
        <div
          // Hidden placeholder enables E2E assertions without rendering a note section.
          className="hidden"
          data-testid="portal-session-parent-note-empty"
        />
      )}

      {isRequestModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="portal-absence-modal"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  {t("portal.absence.modal.title")}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {t("portal.absence.modal.helper")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRequestModal}
                className="text-xs font-semibold text-[var(--muted)]"
                data-testid="portal-absence-modal-close"
              >
                {t("portal.common.cancel")}
              </button>
            </div>

            {requestError ? (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {t("portal.absence.error.title")}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {t("portal.absence.error.body")}
                </p>
              </div>
            ) : null}

            {requestMode === "view" ? (
              <div className="mt-4 space-y-3">
                {!requestDetail ? (
                  <div className="space-y-2">
                    <PortalSkeletonBlock className="h-4 w-40" />
                    <PortalSkeletonBlock className="h-4 w-56" />
                    <PortalSkeletonBlock className="h-16 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-1 text-sm text-[var(--text)]">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {t("portal.absence.field.reason.label")}
                      </span>
                      <span>
                        {t(resolveReasonLabelKey(requestDetail.reasonCode))}
                      </span>
                    </div>
                    {requestDetail.message ? (
                      <div className="grid gap-1 text-sm text-[var(--text)]">
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {t("portal.absence.field.message.label")}
                        </span>
                        <p className="whitespace-pre-line text-sm text-[var(--text)]">
                          {requestDetail.message}
                        </p>
                      </div>
                    ) : null}
                    <div className="grid gap-1 text-sm text-[var(--text)]">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {t("portal.absence.status.label")}
                      </span>
                      <span
                        className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${getRequestStatusTone(
                          requestDetail.status,
                        )}`}
                      >
                        {t(getRequestStatusLabelKey(requestDetail.status))}
                      </span>
                    </div>
                    <div className="grid gap-1 text-xs text-[var(--muted)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--muted)]">
                          {t("portal.absence.status.submittedAt")}
                        </span>
                        <span>
                          {formatPortalDateTime(requestDetail.createdAt, locale) ||
                            t("generic.dash")}
                        </span>
                      </div>
                      {requestDetail.resolvedAt ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--muted)]">
                            {t("portal.absence.status.updatedAt")}
                          </span>
                          <span>
                            {formatPortalDateTime(requestDetail.resolvedAt, locale) ||
                              t("generic.dash")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSubmitRequest();
                }}
              >
                <label className="flex flex-col gap-2 text-sm text-[var(--text)]">
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {t("portal.absence.field.reason.label")}
                  </span>
                  {/* Data-testid keeps the absence reason selector stable for E2E. */}
                  <select
                    className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
                    data-testid="portal-absence-reason"
                    value={requestReason}
                    onChange={(event) => setRequestReason(event.target.value)}
                    disabled={isRequestSubmitting}
                  >
                    <option value="">
                      {t("portal.absence.field.reason.placeholder")}
                    </option>
                    {ABSENCE_REASON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm text-[var(--text)]">
                  <span className="text-sm font-semibold text-[var(--text)]">
                    {t("portal.absence.field.message.label")}
                  </span>
                  {/* Data-testid keeps the optional message input stable for E2E. */}
                  <textarea
                    className="min-h-[90px] resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
                    data-testid="portal-absence-message"
                    value={requestMessage}
                    onChange={(event) => setRequestMessage(event.target.value)}
                    disabled={isRequestSubmitting}
                  />
                  <span className="text-xs text-[var(--muted)]">
                    {t("portal.absence.field.message.helper")}
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
                    disabled={isRequestSubmitting}
                    data-testid="portal-absence-submit"
                  >
                    {isRequestSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary-foreground)] border-t-transparent" />
                        {t("portal.absence.state.submitting")}
                      </span>
                    ) : (
                      t("portal.absence.action.submit")
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={closeRequestModal}
                    className="inline-flex h-11 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)]"
                    disabled={isRequestSubmitting}
                  >
                    {t("portal.common.cancel")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
