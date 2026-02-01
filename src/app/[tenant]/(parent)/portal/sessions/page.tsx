"use client";

// Parent portal sessions page with range and student filters.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalEmptyState from "@/components/parent/portal/PortalEmptyState";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import SessionRow from "@/components/parent/portal/SessionRow";
import { fetchJson } from "@/lib/api/fetchJson";

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type PortalStudentsResponse = {
  items: PortalStudent[];
};

type PortalSession = {
  id: string;
  studentId: string;
  startAt: string;
  sessionType: string;
  groupName?: string | null;
};

type PortalSessionsResponse = {
  items: PortalSession[];
};

const RANGE_OPTIONS = [7, 14, 30];

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function getRangeFromToday(days: number) {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + days);
  return { from, to };
}

export default function PortalSessionsPage() {
  const t = useTranslations();
  const params = useParams<{ tenant?: string }>();
  const searchParams = useSearchParams();
  const tenant = typeof params.tenant === "string" ? params.tenant : "";

  const [students, setStudents] = useState<PortalStudent[]>([]);
  const [sessions, setSessions] = useState<PortalSession[]>([]);
  // Honor deep links from the student detail page via the studentId query param.
  const initialStudentId = searchParams.get("studentId") ?? "all";
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [rangeDays, setRangeDays] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const studentNameById = useMemo(
    () => new Map(students.map((student) => [student.id, `${student.firstName} ${student.lastName}`])),
    [students],
  );

  const loadStudents = useCallback(async () => {
    if (!tenant) return;
    const query = new URLSearchParams({ take: "100", skip: "0" });
    const result = await fetchJson<PortalStudentsResponse>(
      buildPortalApiUrl(tenant, "/students", query),
    );

    if (result.ok) {
      setStudents(result.data.items ?? []);
    } else {
      setHasError(true);
    }
  }, [tenant]);

  const loadSessions = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setHasError(false);

    const range = getRangeFromToday(rangeDays);
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      take: "100",
      skip: "0",
    });
    if (selectedStudentId !== "all") {
      params.set("studentId", selectedStudentId);
    }

    const result = await fetchJson<PortalSessionsResponse>(
      buildPortalApiUrl(tenant, "/sessions", params),
    );

    if (!result.ok) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setSessions(result.data.items ?? []);
    setIsLoading(false);
  }, [rangeDays, selectedStudentId, tenant]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadStudents();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadStudents]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadSessions]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="portal-sessions-loading">
        <PortalSkeletonBlock className="h-8 w-40" />
        <PortalSkeletonBlock className="h-4 w-72" />
        <PortalSkeletonBlock className="h-12 w-full" />
        <div className="grid gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <Card>
        <div className="space-y-3 text-center" data-testid="portal-sessions-error">
          <h2 className="text-base font-semibold text-[var(--text)]">
            {t("portal.error.sessions.title")}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {t("portal.error.sessions.body")}
          </p>
          <button
            type="button"
            onClick={() => void loadSessions()}
            className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("portal.common.tryAgain")}
          </button>
        </div>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <PortalEmptyState
        variant="noStudents"
        hintKey="portal.empty.noStudents.hint"
        actionLabelKey="portal.empty.noStudents.cta"
        actionHref={tenant ? `/${tenant}/portal/students` : "/portal/students"}
      />
    );
  }

  const studentFilterDisabled = students.length <= 1;

  return (
    <div className="space-y-6" data-testid="portal-sessions-page">
      <PageHeader
        titleKey="portal.sessions.title"
        subtitleKey="portal.sessions.helper"
      />
      <div className="flex flex-wrap gap-3" data-testid="portal-sessions-filters">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t("portal.sessions.filter.student")}
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            disabled={studentFilterDisabled}
          >
            <option value="all">{t("portal.common.allStudents")}</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.firstName} {student.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t("portal.sessions.filter.range")}
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
            value={rangeDays}
            onChange={(event) => setRangeDays(Number(event.target.value))}
          >
            {RANGE_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {t(`portal.sessions.range.${days}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sessions.length === 0 ? (
        <PortalEmptyState variant="noUpcomingSessions" />
      ) : (
        <div className="grid gap-3" data-testid="portal-sessions-list">
          {sessions.map((session) => (
            <SessionRow
              // Include studentId in the key because sessions can repeat per linked student.
              key={`${session.id}-${session.studentId}`}
              session={{
                id: session.id,
                startAt: session.startAt,
                sessionType: session.sessionType,
                groupName: session.groupName ?? null,
                studentName: studentNameById.get(session.studentId) ?? null,
              }}
              // Route session rows to the new session detail view.
              href={
                tenant
                  ? `/${tenant}/portal/sessions/${session.id}`
                  : `/portal/sessions/${session.id}`
              }
              showStudentName
            />
          ))}
        </div>
      )}
    </div>
  );
}

