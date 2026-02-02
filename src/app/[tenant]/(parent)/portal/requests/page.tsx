"use client";

// Parent portal requests page lists absence requests and links back to session detail.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
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
};

type PortalRequestsResponse = {
  items: PortalRequest[];
};

type PortalSessionDetail = {
  id: string;
  sessionType: string;
  startAt: string;
  endAt: string;
  groupName?: string | null;
};

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type PortalSessionDetailResponse = {
  session: PortalSessionDetail;
  students: Array<{ student: PortalStudent }>;
};

type RequestRow = {
  id: string;
  status: string;
  sessionId: string;
  studentId: string;
  submittedAt: string;
  updatedAt: string;
  sessionTitle: string;
  sessionStartAt: string | null;
  studentName: string;
};

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
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

export default function PortalRequestsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams<{ tenant?: string }>();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setHasError(false);

    const params = new URLSearchParams({ take: "50", skip: "0" });
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

    const uniqueSessionIds = Array.from(
      new Set(requests.map((request) => request.sessionId)),
    );
    const sessionMap = new Map<string, PortalSessionDetailResponse>();

    await Promise.all(
      uniqueSessionIds.map(async (sessionId) => {
        const sessionResult = await fetchJson<PortalSessionDetailResponse>(
          buildPortalApiUrl(tenant, `/sessions/${sessionId}`),
        );
        if (sessionResult.ok) {
          sessionMap.set(sessionId, sessionResult.data);
        }
      }),
    );

    const nextRows = requests.map((request) => {
      const sessionDetail = sessionMap.get(request.sessionId);
      const sessionTypeKey = sessionDetail
        ? getSessionTypeLabelKey(sessionDetail.session.sessionType)
        : null;
      // Guard against null session type keys before passing to i18n.
      const sessionTypeLabel = sessionTypeKey ? t(sessionTypeKey) : t("generic.dash");
      const sessionTitle = sessionDetail?.session.groupName?.trim()
        ? sessionDetail.session.groupName
        : sessionTypeLabel;
      const sessionStartAt = sessionDetail?.session.startAt ?? null;
      const studentEntry = sessionDetail?.students.find(
        (entry) => entry.student.id === request.studentId,
      );
      const studentName = studentEntry
        ? `${studentEntry.student.firstName} ${studentEntry.student.lastName}`
        : t("generic.dash");
      const submittedAt = request.createdAt;
      const updatedAt = request.resolvedAt || request.updatedAt || request.createdAt;

      return {
        id: request.id,
        status: request.status,
        sessionId: request.sessionId,
        studentId: request.studentId,
        submittedAt,
        updatedAt,
        sessionTitle,
        sessionStartAt,
        studentName,
      };
    });

    setRows(nextRows);
    setIsLoading(false);
  }, [t, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadRequests]);

  const emptyState = (
    <Card>
      <div className="space-y-3 text-center" data-testid="portal-requests-empty">
        <h2 className="text-base font-semibold text-[var(--text)]">
          {t("portal.requests.empty.title")}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {t("portal.requests.empty.body")}
        </p>
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
        <p className="text-sm text-[var(--muted)]">
          {t("portal.requests.error.body")}
        </p>
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
        <PageHeader
          titleKey="portal.requests.title"
          subtitleKey="portal.requests.helper"
        />
        {errorState}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-6" data-testid="portal-requests-page">
        <PageHeader
          titleKey="portal.requests.title"
          subtitleKey="portal.requests.helper"
        />
        {emptyState}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="portal-requests-page">
      <PageHeader
        titleKey="portal.requests.title"
        subtitleKey="portal.requests.helper"
      />

      <div className="grid gap-3">
        {rows.map((row) => {
          const statusLabel = t(getRequestStatusLabelKey(row.status));
          const statusTone = getRequestStatusTone(row.status);
          const sessionDateTime = row.sessionStartAt
            ? formatPortalDateTime(row.sessionStartAt, locale) || t("generic.dash")
            : t("generic.dash");
          const updatedLabel = row.updatedAt
            ? formatPortalDateTime(row.updatedAt, locale) || t("generic.dash")
            : t("generic.dash");
          const href = tenant
            ? `/${tenant}/portal/sessions/${row.sessionId}`
            : `/portal/sessions/${row.sessionId}`;

          return (
            <Link
              key={row.id}
              href={href}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:bg-[var(--surface-2)]"
              data-testid={`portal-request-row-${row.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">
                    {sessionDateTime || t("generic.dash")}
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    {row.sessionTitle}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{row.studentName}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${statusTone}`}
                  >
                    {statusLabel}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {t("portal.absence.status.updatedAt")}: {updatedLabel}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
