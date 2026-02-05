"use client";

// Parent portal requests page lists absence requests and supports pending withdraws.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import PortalTimeHint from "@/components/parent/portal/PortalTimeHint";
import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTime, getSessionTypeLabelKey } from "@/lib/portal/format";

type PortalRequest = {
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
  session?: {
    id: string;
    startAt: string;
    sessionType: string;
    timezone?: string | null;
    group?: { name: string | null } | null;
  } | null;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

type PortalRequestsResponse = {
  items: PortalRequest[];
  take?: number;
  skip?: number;
};

type RequestStatus = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

type RequestStatusFilter = RequestStatus | "ALL";

type RequestRow = {
  id: string;
  status: RequestStatus;
  sessionId: string;
  studentId: string;
  submittedAt: string;
  updatedAt: string;
  sessionTitle: string;
  sessionStartAt: string | null;
  sessionTimeZone: string | null;
  studentName: string;
  canWithdraw: boolean;
};

const STATUS_FILTER_OPTIONS: Array<{
  value: RequestStatusFilter;
  labelKey: string;
}> = [
  { value: "ALL", labelKey: "portal.requests.filter.status.all" },
  { value: "PENDING", labelKey: "portal.requests.filter.status.pending" },
  { value: "APPROVED", labelKey: "portal.requests.filter.status.approved" },
  { value: "DECLINED", labelKey: "portal.requests.filter.status.declined" },
  { value: "WITHDRAWN", labelKey: "portal.requests.filter.status.withdrawn" },
];

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function getRequestStatusLabelKey(status: string | null | undefined) {
  switch (status) {
    case "PENDING":
      // Parent-friendly labels use the contract's pending-friendly copy.
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

function sortRequestRows(rows: RequestRow[]) {
  // Sort by submittedAt to keep "newest first" stable even after status updates.
  return [...rows].sort((a, b) => {
    const aSubmitted = new Date(a.submittedAt).getTime();
    const bSubmitted = new Date(b.submittedAt).getTime();
    if (aSubmitted !== bSubmitted) return bSubmitted - aSubmitted;
    const aUpdated = new Date(a.updatedAt).getTime();
    const bUpdated = new Date(b.updatedAt).getTime();
    return bUpdated - aUpdated;
  });
}

export default function PortalRequestsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ tenant?: string }>();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";
  // Use portal identity data to align request timestamps with the portal timezone hint.
  const { data: portalMe } = usePortalMe();
  const timeZone = portalMe?.tenant?.timeZone ?? undefined;

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<RequestRow | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isWithdrawSubmitting, setIsWithdrawSubmitting] = useState(false);
  // Surface per-session timezones so the hint matches rendered timestamps.
  const requestTimeZones = useMemo(
    () => rows.map((row) => row.sessionTimeZone),
    [rows],
  );

  const loadRequests = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setHasError(false);

    const params = new URLSearchParams({ take: "50", skip: "0" });
    if (statusFilter !== "ALL") {
      params.set("status", statusFilter);
    }

    const result = await fetchJson<PortalRequestsResponse>(
      buildPortalApiUrl(tenant, "/requests", params),
    );

    if (!result.ok) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    const requests = result.data.items ?? [];
    if (!requests.length) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    // Prefer the portal-safe summary data included on each request item.
    const mappedRows = requests.map((request) => {
      const sessionSummary = request.session;
      const sessionTypeKey = sessionSummary
        ? getSessionTypeLabelKey(sessionSummary.sessionType)
        : null;
      // Guard against null session type keys before passing to i18n.
      const sessionTypeLabel = sessionTypeKey ? t(sessionTypeKey) : t("generic.dash");
      const sessionTitle = sessionSummary?.group?.name?.trim()
        ? sessionSummary.group.name ?? sessionTypeLabel
        : sessionTypeLabel;
      const sessionStartAt = sessionSummary?.startAt ?? null;
      const sessionTimeZone = sessionSummary?.timezone ?? null;
      const isUpcoming = sessionStartAt
        ? new Date(sessionStartAt).getTime() > Date.now()
        : false;
      const studentName = request.student
        ? `${request.student.firstName} ${request.student.lastName}`
        : t("generic.dash");
      const submittedAt = request.createdAt;
      const updatedAt = request.updatedAt || request.resolvedAt || request.createdAt;
      const statusValue = request.status as RequestStatus;

      return {
        id: request.id,
        status: statusValue,
        sessionId: request.sessionId,
        studentId: request.studentId,
        submittedAt,
        updatedAt,
        sessionTitle,
        sessionStartAt,
        sessionTimeZone,
        studentName,
        canWithdraw: statusValue === "PENDING" && isUpcoming,
      } satisfies RequestRow;
    });

    setRows(sortRequestRows(mappedRows));
    setIsLoading(false);
  }, [statusFilter, t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRequests]);

  const handleWithdraw = useCallback(async () => {
    if (!tenant || !withdrawTarget) return;

    setIsWithdrawSubmitting(true);
    setWithdrawError(null);

    const result = await fetchJson<{ request: PortalRequest }>(
      buildPortalApiUrl(tenant, `/requests/${withdrawTarget.id}/withdraw`),
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
    setWithdrawTarget(null);
    setToast(t("portal.absence.toast.withdrawn"));
    void loadRequests();
  }, [loadRequests, t, tenant, withdrawTarget]);

  const openWithdrawModal = useCallback((row: RequestRow) => {
    // Reset any prior error so each withdraw attempt starts clean.
    setWithdrawTarget(row);
    setWithdrawError(null);
  }, []);

  const closeWithdrawModal = useCallback(() => {
    setWithdrawTarget(null);
    setWithdrawError(null);
  }, []);

  const tableRows = useMemo(() => rows, [rows]);

  const emptyState = (
    <Card>
      <div className="space-y-3 text-center" data-testid="portal-requests-empty">
        <h2 className="text-base font-semibold text-[var(--text)]">
          {t("portal.requests.empty.title")}
        </h2>
        <p className="text-sm text-[var(--muted)]">{t("portal.requests.empty.body")}</p>
        <Link
          href={tenant ? `/${tenant}/portal/sessions` : "/portal/sessions"}
          className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
        >
          {t("portal.requests.empty.cta")}
        </Link>
      </div>
    </Card>
  );

  const errorState = (
    <Card>
      <div className="space-y-3 text-center" data-testid="portal-requests-error">
        <h2 className="text-base font-semibold text-[var(--text)]">
          {t("portal.requests.error.title")}
        </h2>
        <p className="text-sm text-[var(--muted)]">{t("portal.requests.error.body")}</p>
        <button
          type="button"
          onClick={() => void loadRequests()}
          className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
        >
          {t("portal.common.tryAgain")}
        </button>
      </div>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-requests-loading">
        <PortalSkeletonBlock className="h-8 w-36" />
        <PortalSkeletonBlock className="h-4 w-64" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-6" data-testid="portal-requests-page">
        <PageHeader titleKey="portal.requests.title" subtitleKey="portal.requests.helper" />
        {/* Time hint anchors request list timestamps to the portal timezone rule. */}
        <PortalTimeHint timeZones={requestTimeZones} />
        {errorState}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-6" data-testid="portal-requests-page">
        <PageHeader titleKey="portal.requests.title" subtitleKey="portal.requests.helper" />
        {/* Time hint stays visible even when the list is empty. */}
        <PortalTimeHint timeZones={requestTimeZones} />
        {emptyState}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="portal-requests-page">
      <PageHeader titleKey="portal.requests.title" subtitleKey="portal.requests.helper" />
      {/* Time hint keeps request timestamps consistent across portal pages. */}
      <PortalTimeHint timeZones={requestTimeZones} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)]">
          {t("portal.requests.filter.status.label")}
          <select
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as RequestStatusFilter)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        {toast ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
            {toast}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="hidden grid-cols-[minmax(140px,_1fr)_minmax(180px,_1fr)_minmax(160px,_1fr)_minmax(120px,_auto)_minmax(140px,_auto)_48px] items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold text-[var(--muted)] md:grid">
          <span>{t("portal.absence.status.submittedAt")}</span>
          <span>{t("portal.sessionDetail.field.dateTime")}</span>
          <span>{t("portal.common.student")}</span>
          <span className="text-right">{t("portal.common.status")}</span>
          <span className="text-right">{t("portal.absence.status.updatedAt")}</span>
          <span className="sr-only">{t("portal.absence.action.withdraw")}</span>
        </div>

        {tableRows.map((row) => {
          const statusLabel = t(getRequestStatusLabelKey(row.status));
          const statusTone = getRequestStatusTone(row.status);
          const rowTimeZone = row.sessionTimeZone ?? timeZone;
          const sessionDateTime = row.sessionStartAt
            ? formatPortalDateTime(row.sessionStartAt, locale, rowTimeZone) ||
              t("generic.dash")
            : t("generic.dash");
          const updatedLabel = row.updatedAt
            ? formatPortalDateTime(row.updatedAt, locale, rowTimeZone) ||
              t("generic.dash")
            : t("generic.dash");
          const submittedLabel = row.submittedAt
            ? formatPortalDateTime(row.submittedAt, locale, rowTimeZone) ||
              t("generic.dash")
            : t("generic.dash");
          const href = tenant
            ? `/${tenant}/portal/sessions/${row.sessionId}#absence-request`
            : `/portal/sessions/${row.sessionId}#absence-request`;

          return (
            <div
              key={row.id}
              // Data attributes make request ordering assertions deterministic in E2E.
              data-testid={`portal-request-row-${row.id}`}
              data-submitted-at={row.submittedAt}
              data-updated-at={row.updatedAt}
              data-session-start-at={row.sessionStartAt ?? ""}
            >
              <div className="hidden items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:grid md:grid-cols-[minmax(140px,_1fr)_minmax(180px,_1fr)_minmax(160px,_1fr)_minmax(120px,_auto)_minmax(140px,_auto)_48px]">
                <Link href={href} className="text-sm text-[var(--text)]">
                  {submittedLabel}
                </Link>
                <Link href={href} className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--text)]">
                    {sessionDateTime}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{row.sessionTitle}</div>
                </Link>
                <Link href={href} className="text-sm text-[var(--text)]">
                  {row.studentName}
                </Link>
                <Link href={href} className="flex justify-end">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${statusTone}`}
                    // Status test id keeps desktop list assertions stable in E2E.
                    data-testid={`portal-request-status-${row.id}-desktop`}
                  >
                    {statusLabel}
                  </span>
                </Link>
                <Link href={href} className="text-right text-sm text-[var(--text)]">
                  {updatedLabel}
                </Link>
                <div className="flex justify-end">
                  {row.canWithdraw ? (
                    // Use a native details menu for the minimal overflow action.
                    <details className="relative">
                      <summary className="flex h-9 w-9 list-none items-center justify-center rounded-full border border-[var(--border)] text-xs font-semibold text-[var(--muted)]">
                        <span className="sr-only">
                          {t("portal.absence.action.withdraw")}
                        </span>
                        <span aria-hidden="true">...</span>
                      </summary>
                      <div className="absolute right-0 mt-2 w-40 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                        <button
                          type="button"
                          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
                          onClick={(event) => {
                            openWithdrawModal(row);
                            // Close the overflow menu after choosing the action.
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                        >
                          {t("portal.absence.action.withdraw")}
                        </button>
                      </div>
                    </details>
                  ) : (
                    <span className="h-9 w-9" aria-hidden="true" />
                  )}
                </div>
              </div>

              {/* Mobile card layout keeps actions tappable on small screens. */}
              <div className="md:hidden">
                <div className="flex flex-col gap-3">
                  <Link
                    href={href}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text)]">
                          {sessionDateTime}
                        </div>
                        <div className="text-sm text-[var(--muted)]">
                          {row.sessionTitle}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {row.studentName}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${statusTone}`}
                        // Status test id keeps mobile list assertions stable in E2E.
                        data-testid={`portal-request-status-${row.id}-mobile`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-[var(--muted)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--muted)]">
                          {t("portal.absence.status.submittedAt")}
                        </span>
                        <span>{submittedLabel}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--muted)]">
                          {t("portal.absence.status.updatedAt")}
                        </span>
                        <span>{updatedLabel}</span>
                      </div>
                    </div>
                  </Link>
                  {row.canWithdraw ? (
                    <button
                      type="button"
                      onClick={() => openWithdrawModal(row)}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)]"
                      data-testid={`portal-request-withdraw-${row.id}`}
                    >
                      {t("portal.absence.action.withdraw")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {withdrawTarget ? (
        // Withdraw confirm modal reuses the session detail copy/flow.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="portal-requests-withdraw-modal"
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
                onClick={() => void handleWithdraw()}
                className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60"
                disabled={isWithdrawSubmitting}
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
