/**
 * @state.route /[tenant]/portal/sessions/[id]
 * @state.area parent
 * @state.capabilities view:detail, report_absence:create_request, request:withdraw, request:resubmit
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
"use client";

// Parent portal session detail page with per-student attendance and notes.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import PortalTimeHint from "@/components/parent/portal/PortalTimeHint";
import { fetchJson } from "@/lib/api/fetchJson";
import {
  formatPortalDateTime,
  formatPortalDateTimeRange,
  formatPortalDuration,
  getAttendanceStatusLabelKey,
  getSessionTypeLabelKey,
} from "@/lib/portal/format";

type PortalSessionDetail = {
  id: string;
  sessionType: string;
  startAt: string;
  endAt: string | null;
  timezone?: string | null;
  zoomLink?: string | null;
  canceledAt?: string | null;
  cancelReasonCode?: string | null;
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
  updatedAt?: string | null;
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

type PortalSessionResource = {
  id: string;
  title: string;
  url: string;
  type: "HOMEWORK" | "WORKSHEET" | "VIDEO" | "OTHER";
  updatedAt: string;
};

type PortalSessionDetailResponse = {
  session: PortalSessionDetail;
  students: Array<{
    student: PortalStudent;
    attendance: PortalAttendance;
    request: PortalRequestSummary;
  }>;
  resources: PortalSessionResource[];
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

// Portal API errors expose safe codes for client-side handling.
function resolvePortalErrorCode(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const payload = details as { error?: { code?: unknown } };
  const code = payload.error?.code;
  return typeof code === "string" ? code : undefined;
}

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}


function getRequestStatusLabelKey(status: string | null | undefined) {
  switch (status) {
    case "PENDING":
      // Parent-facing pending label uses the friendly "Pending review" copy.
      return "portal.absence.status.pendingFriendly";
    case "APPROVED":
      return "portal.absence.status.approved";
    case "DECLINED":
      return "portal.absence.status.declined";
    case "WITHDRAWN":
      return "portal.absence.status.withdrawn";
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
    case "WITHDRAWN":
      return "portal.absence.status.withdrawnHelper";
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
    case "WITHDRAWN":
      return "border-[var(--border)] text-[var(--muted)]";
    default:
      return "border-[var(--border)] text-[var(--muted)]";
  }
}

function resolveReasonLabelKey(reasonCode: string | null | undefined) {
  if (!reasonCode) return "generic.dash";
  const match = ABSENCE_REASON_OPTIONS.find((option) => option.value === reasonCode);
  return match?.labelKey ?? "generic.dash";
}

function getSessionCancelReasonLabelKey(reasonCode: string | null | undefined) {
  switch (reasonCode) {
    case "WEATHER":
      return "portal.sessions.cancelReason.WEATHER";
    case "TUTOR_UNAVAILABLE":
      return "portal.sessions.cancelReason.TUTOR_UNAVAILABLE";
    case "HOLIDAY":
      return "portal.sessions.cancelReason.HOLIDAY";
    case "LOW_ENROLLMENT":
      return "portal.sessions.cancelReason.LOW_ENROLLMENT";
    case "OTHER":
      return "portal.sessions.cancelReason.OTHER";
    default:
      return null;
  }
}

function getResourceTypeLabelKey(
  type: PortalSessionResource["type"],
) {
  switch (type) {
    case "HOMEWORK":
      return "sessionResources.type.homework";
    case "WORKSHEET":
      return "sessionResources.type.worksheet";
    case "VIDEO":
      return "sessionResources.type.video";
    default:
      return "sessionResources.type.other";
  }
}

export default function PortalSessionDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  // Session detail uses the shared portal time zone for consistent formatting.
  const { data: portalMe } = usePortalMe();
  const tenantTimeZone = portalMe?.tenant?.timeZone ?? undefined;
  const params = useParams<{ tenant?: string; id?: string }>();
  const router = useRouter();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  const sessionId = typeof params.id === "string" ? params.id : "";

  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<PortalSessionDetailResponse | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestMode, setRequestMode] = useState<"create" | "view" | "resubmit">(
    "create",
  );
  const [requestReason, setRequestReason] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestToast, setRequestToast] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<PortalRequestDetail | null>(null);
  // Track the request id for resubmits to avoid races before details load.
  const [resubmitTargetId, setResubmitTargetId] = useState<string | null>(null);
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawTargetId, setWithdrawTargetId] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isWithdrawSubmitting, setIsWithdrawSubmitting] = useState(false);
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
      const errorCode = resolvePortalErrorCode(result.details);
      if (result.status === 401 || errorCode === "UNAUTHORIZED") {
        router.replace(tenant ? `/${tenant}/parent/login` : "/parent/login");
        return;
      }
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
  }, [router, sessionId, tenant]);

  const loadRequestDetail = useCallback(
    async (
      sessionTarget: string,
      studentTarget: string,
      mode: "view" | "resubmit",
    ) => {
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
      if (mode === "resubmit" && match) {
        // Prefill only when fields are still empty to avoid overwriting user edits.
        setRequestReason((current) => current || match.reasonCode);
        setRequestMessage((current) => current || (match.message ?? ""));
      }
    },
    [tenant],
  );

  const closeRequestModal = useCallback(() => {
    setIsRequestModalOpen(false);
    setRequestError(null);
    setRequestMode("create");
    setResubmitTargetId(null);
  }, []);

  const openWithdrawModal = useCallback((requestId: string) => {
    // Withdraw requires a confirm dialog before calling the API.
    setWithdrawTargetId(requestId);
    setIsWithdrawModalOpen(true);
    setWithdrawError(null);
  }, []);

  const closeWithdrawModal = useCallback(() => {
    setIsWithdrawModalOpen(false);
    setWithdrawTargetId(null);
    setWithdrawError(null);
    setIsWithdrawSubmitting(false);
  }, []);

  const openRequestModal = useCallback(
    (
      mode: "create" | "view" | "resubmit",
      sessionTarget: string,
      studentTarget: string,
      requestId?: string,
    ) => {
      setRequestMode(mode);
      setIsRequestModalOpen(true);
      setRequestError(null);
      if (mode === "resubmit" && requestId) {
        // Store the target id so resubmits work even if detail loading lags.
        setResubmitTargetId(requestId);
      }
      if (mode === "create") {
        setRequestReason("");
        setRequestMessage("");
        return;
      }
      // Load request details on demand to keep initial payloads small.
      void loadRequestDetail(sessionTarget, studentTarget, mode);
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

  // Withdraw/resubmit actions update the existing request record (no duplicates).
  const handleWithdrawRequest = useCallback(async () => {
    if (!tenant || !withdrawTargetId) return;

    setIsWithdrawSubmitting(true);
    setWithdrawError(null);

    const result = await fetchJson<{ request: PortalRequestDetail }>(
      buildPortalApiUrl(tenant, `/requests/${withdrawTargetId}/withdraw`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (!result.ok) {
      setWithdrawError("withdraw");
      setIsWithdrawSubmitting(false);
      return;
    }

    setIsWithdrawSubmitting(false);
    setIsWithdrawModalOpen(false);
    setWithdrawTargetId(null);
    setRequestToast(t("portal.absence.toast.withdrawn"));
    setRequestDetail(result.data.request);
    void loadSession();
  }, [loadSession, t, tenant, withdrawTargetId]);

  const handleResubmitRequest = useCallback(async () => {
    const targetId = requestDetail?.id ?? resubmitTargetId;
    if (!tenant || !targetId) {
      setRequestError("submit");
      return;
    }
    if (!requestReason) {
      setRequestError("validation");
      return;
    }

    setIsRequestSubmitting(true);
    setRequestError(null);

    const payload = {
      reasonCode: requestReason,
      message: requestMessage.trim() ? requestMessage.trim() : undefined,
    };

    const result = await fetchJson<{ request: PortalRequestDetail }>(
      buildPortalApiUrl(tenant, `/requests/${targetId}/resubmit`),
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
    setRequestToast(t("portal.absence.toast.resubmitted"));
    setRequestDetail(result.data.request);
    setRequestMode("view");
    setResubmitTargetId(null);
    void loadSession();
  }, [
    loadSession,
    requestDetail,
    requestMessage,
    requestReason,
    resubmitTargetId,
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
      setIsWithdrawModalOpen(false);
      setWithdrawTargetId(null);
      setWithdrawError(null);
      setResubmitTargetId(null);
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
  const resources = sessionDetail?.resources ?? [];
  const isSessionCanceled = Boolean(session?.canceledAt);
  // Prefer the session timezone so parent times align with admin display.
  const sessionTimeZone = session?.timezone ?? tenantTimeZone;
  const sessionCancelReasonKey = getSessionCancelReasonLabelKey(
    session?.cancelReasonCode,
  );
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
  const requestUpdatedAt =
    requestSummary?.updatedAt ??
    requestSummary?.resolvedAt ??
    requestSummary?.createdAt ??
    null;
  // Modal copy changes for resubmit vs initial submission.
  const requestModalTitleKey =
    requestMode === "resubmit"
      ? "portal.absence.resubmit.modal.title"
      : "portal.absence.modal.title";
  const requestModalBodyKey =
    requestMode === "resubmit"
      ? "portal.absence.resubmit.modal.body"
      : "portal.absence.modal.helper";
  const requestModalConfirmKey =
    requestMode === "resubmit"
      ? "portal.absence.resubmit.modal.confirm"
      : "portal.absence.action.submit";
  const canWithdraw = Boolean(
    isUpcomingSession && requestSummary?.status === "PENDING",
  );
  const canResubmit = Boolean(
    isUpcomingSession && requestSummary?.status === "WITHDRAWN",
  );
  const showPastActionNotice = Boolean(
    !isUpcomingSession &&
      (requestSummary?.status === "PENDING" ||
        requestSummary?.status === "WITHDRAWN"),
  );
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
            {t("portal.error.notAvailable.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.error.notAvailable.body")}
          </p>
          <Link
            href={tenant ? `/${tenant}/portal` : "/portal"}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.error.notAvailable.cta")}
          </Link>
        </div>
      </Card>
    );
  }

  if (isSessionCanceled) {
    return (
      <div className="space-y-6" data-testid="portal-session-detail-canceled">
        <div className="space-y-3">
          <Link
            href={backHref}
            className="text-sm text-[var(--muted)]"
          >
            {t("portal.common.back")}
          </Link>
          <PageHeader titleKey="portal.sessionDetail.title" />
        </div>
        <Card>
          <div className="space-y-3 text-center">
            <h2 className="text-base font-semibold text-[var(--text)]">
              {t("portal.sessionDetail.canceled.title")}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {t("portal.sessionDetail.canceled.body")}
            </p>
            <p className="text-sm text-[var(--text)]">
              {t("portal.sessionDetail.canceled.reasonLabel")}:{" "}
              {sessionCancelReasonKey
                ? t(sessionCancelReasonKey)
                : t("portal.sessionDetail.canceled.reasonUnknown")}
            </p>
            <Link
              href={backHref}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
            >
              {t("portal.sessionDetail.canceled.backToSessions")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const dateTimeLabel = formatPortalDateTimeRange(
    session.startAt,
    session.endAt,
    locale,
    sessionTimeZone,
  );
  const durationLabel = session.endAt
    ? formatPortalDuration(session.startAt, session.endAt)
    : "";

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
        {/* Time hint reinforces the portal timezone rule on session detail pages. */}
        <PortalTimeHint timeZones={[session?.timezone]} />
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
                      formatPortalDateTime(
                        session.startAt,
                        locale,
                        sessionTimeZone,
                      ) ||
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
              {session.zoomLink?.trim() ? (
                <div className="grid gap-1 md:grid-cols-[160px_1fr] md:items-center">
                  <span className="text-sm text-[var(--muted)]">
                    {t("session.zoomLink.label")}
                  </span>
                  <a
                    className="w-fit text-sm font-semibold text-[var(--primary)] underline"
                    href={session.zoomLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("session.zoomLink.open")}
                  </a>
                </div>
              ) : null}
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

      <Card>
        <div className="space-y-4" data-testid="portal-session-resources">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("sessionResources.section.title")}
          </h2>

          {resources.length === 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text)]">
                {t("sessionResources.empty.parent.title")}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {t("sessionResources.empty.parent.helper")}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {resources.map((resource) => (
                <li
                  key={resource.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
                      {t(getResourceTypeLabelKey(resource.type))}
                    </span>
                    <p className="text-sm font-medium text-[var(--text)]">
                      {resource.title}
                    </p>
                  </div>
                  <a
                    className="mt-1 inline-flex text-sm font-semibold text-[var(--primary)] underline"
                    href={resource.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("sessionResources.openLink")}
                  </a>
                </li>
              ))}
            </ul>
          )}
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

      <div id="absence-request">
        {/* Anchor enables My Requests deep-linking into the absence request section. */}
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
                      ? formatPortalDateTime(
                          requestSummary.createdAt,
                          locale,
                          sessionTimeZone,
                        ) ||
                        t("generic.dash")
                      : t("generic.dash")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--muted)]">
                    {t("portal.absence.status.updatedAt")}
                  </span>
                  <span>
                    {requestUpdatedAt
                      ? formatPortalDateTime(
                          requestUpdatedAt,
                          locale,
                          sessionTimeZone,
                        ) ||
                        t("generic.dash")
                      : t("generic.dash")}
                  </span>
                </div>
              </div>
              {requestHelperLabel ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {requestHelperLabel}
                </p>
              ) : null}
              {showPastActionNotice ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {t("portal.absence.past.noActions")}
                </p>
              ) : null}
              {canWithdraw || canResubmit ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canWithdraw && activeEntry ? (
                    <button
                      type="button"
                      onClick={() => openWithdrawModal(requestSummary.id)}
                      className="inline-flex h-9 items-center rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text)]"
                      data-testid="portal-absence-withdraw"
                    >
                      {t("portal.absence.action.withdraw")}
                    </button>
                  ) : null}
                  {canResubmit && activeEntry ? (
                    <button
                      type="button"
                      onClick={() =>
                        openRequestModal(
                          "resubmit",
                          session.id,
                          activeEntry.student.id,
                          requestSummary.id,
                        )
                      }
                      className="inline-flex h-9 items-center rounded-xl bg-[var(--primary)] px-3 text-xs font-semibold text-[var(--primary-foreground)]"
                      data-testid="portal-absence-resubmit"
                    >
                      {t("portal.absence.action.resubmit")}
                    </button>
                  ) : null}
                </div>
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
      </div>

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
                  {t(requestModalTitleKey)}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {t(requestModalBodyKey)}
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
                          {formatPortalDateTime(
                            requestDetail.createdAt,
                            locale,
                            sessionTimeZone,
                          ) || t("generic.dash")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--muted)]">
                          {t("portal.absence.status.updatedAt")}
                        </span>
                        <span>
                          {formatPortalDateTime(
                            requestDetail.updatedAt ??
                              requestDetail.resolvedAt ??
                              requestDetail.createdAt,
                            locale,
                            sessionTimeZone,
                          ) || t("generic.dash")}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (requestMode === "resubmit") {
                    void handleResubmitRequest();
                    return;
                  }
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
                      t(requestModalConfirmKey)
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

      {isWithdrawModalOpen ? (
        // Withdraw modal is separate from the request form to keep the confirm UX clear.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="portal-absence-withdraw-modal"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {t("portal.absence.withdraw.modal.title")}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {t("portal.absence.withdraw.modal.body")}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {t("portal.absence.withdraw.modal.note")}
              </p>
            </div>

            {withdrawError ? (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {t("portal.absence.error.title")}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {t("portal.absence.error.body")}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={closeWithdrawModal}
                className="inline-flex h-11 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)]"
                disabled={isWithdrawSubmitting}
              >
                {t("portal.common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleWithdrawRequest()}
                className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
                disabled={isWithdrawSubmitting}
                // Data-testid keeps the withdraw confirm action stable for E2E.
                data-testid="portal-absence-withdraw-confirm"
              >
                {isWithdrawSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary-foreground)] border-t-transparent" />
                    {t("portal.absence.state.submitting")}
                  </span>
                ) : (
                  t("portal.absence.withdraw.modal.confirm")
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
