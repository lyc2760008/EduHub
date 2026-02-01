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

type PortalSessionDetailResponse = {
  session: PortalSessionDetail;
  students: Array<{ student: PortalStudent; attendance: PortalAttendance }>;
};

function buildPortalApiUrl(tenant: string, path: string) {
  return tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
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

  const loadSession = useCallback(async () => {
    if (!tenant || !sessionId) return;
    setIsLoading(true);
    setNotFound(false);

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
    // Seed the active student once data arrives without a separate effect.
    if (result.data.students.length) {
      setActiveStudentId((current) => current ?? result.data.students[0].student.id);
    }
    setIsLoading(false);
  }, [sessionId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSession();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSession]);

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
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.sessionDetail.section.attendance")}
          </h2>
          {attendance ? (
            <span
              className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${attendanceToneClassName}`}
            >
              {attendanceLabel}
            </span>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {t("portal.sessionDetail.attendance.pending")}
            </p>
          )}
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
    </div>
  );
}
