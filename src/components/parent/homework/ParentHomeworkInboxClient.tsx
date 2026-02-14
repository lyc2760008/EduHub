"use client";

// Parent homework inbox client renders linked-student items with status/date filters and server-side paging.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import PageHeader from "@/components/parent/PageHeader";
import PortalSkeletonBlock from "@/components/parent/portal/PortalSkeletonBlock";
import HomeworkStatusBadge from "@/components/homework/HomeworkStatusBadge";
import {
  formatDateInputValue,
  shiftDate,
  type HomeworkStatus,
  toHomeworkDisplayStatus,
} from "@/components/homework/homeworkClient";
import { fetchJson } from "@/lib/api/fetchJson";
import { formatPortalDateTime } from "@/lib/portal/format";

type ParentHomeworkInboxClientProps = {
  tenant: string;
};

type PortalStudent = {
  id: string;
  firstName: string;
  lastName: string;
};

type PortalStudentsResponse = {
  items: PortalStudent[];
};

type PortalHomeworkInboxItem = {
  homeworkItemId: string;
  studentId: string;
  sessionId: string;
  sessionDate: string;
  timezone: string | null;
  programLabel: string | null;
  status: HomeworkStatus;
  assignedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  fileCounts: {
    assignment: number;
    submission: number;
    feedback: number;
  };
};

type PortalHomeworkInboxResponse = {
  items: PortalHomeworkInboxItem[];
  totalCount: number;
  take: number;
  skip: number;
};

const PAGE_SIZE = 25;

type StatusFilter = "ALL" | HomeworkStatus | "UNASSIGNED";

function buildPortalApiUrl(tenant: string, path: string, params?: URLSearchParams) {
  const base = tenant ? `/t/${tenant}/api/portal${path}` : `/api/portal${path}`;
  if (!params) return base;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export default function ParentHomeworkInboxClient({ tenant }: ParentHomeworkInboxClientProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [students, setStudents] = useState<PortalStudent[]>([]);
  const [items, setItems] = useState<PortalHomeworkInboxItem[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [fromDate, setFromDate] = useState(() => formatDateInputValue(shiftDate(new Date(), -30)));
  const [toDate, setToDate] = useState(() => formatDateInputValue(shiftDate(new Date(), 60)));
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const studentNameById = useMemo(
    () =>
      new Map(
        students.map((student) => [student.id, `${student.firstName} ${student.lastName}`]),
      ),
    [students],
  );

  const loadStudents = useCallback(async () => {
    const result = await fetchJson<PortalStudentsResponse>(
      buildPortalApiUrl(tenant, "/students", new URLSearchParams({ take: "100", skip: "0" })),
    );
    if (!result.ok) {
      setHasError(true);
      return;
    }
    setStudents(result.data.items ?? []);
  }, [tenant]);

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    const params = new URLSearchParams({
      take: String(PAGE_SIZE),
      skip: String((page - 1) * PAGE_SIZE),
      from: fromDate,
      to: toDate,
      status,
    });

    if (selectedStudentId !== "all") {
      params.set("studentId", selectedStudentId);
    }

    const result = await fetchJson<PortalHomeworkInboxResponse>(
      buildPortalApiUrl(tenant, "/homework", params),
    );

    if (!result.ok) {
      setItems([]);
      setTotalCount(0);
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setItems(result.data.items ?? []);
    setTotalCount(result.data.totalCount ?? 0);
    setIsLoading(false);
  }, [fromDate, page, selectedStudentId, status, tenant, toDate]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadStudents();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadStudents]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadInbox();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadInbox]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showStudentFilter = students.length > 1;

  const onFilterChange = (next: {
    studentId?: string;
    status?: StatusFilter;
    from?: string;
    to?: string;
  }) => {
    if (typeof next.studentId === "string") setSelectedStudentId(next.studentId);
    if (next.status) setStatus(next.status);
    if (typeof next.from === "string") setFromDate(next.from);
    if (typeof next.to === "string") setToDate(next.to);
    setPage(1);
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-5" data-testid="parent-homework-inbox-loading">
        <PortalSkeletonBlock className="h-8 w-40" />
        <PortalSkeletonBlock className="h-12 w-full" />
        {Array.from({ length: 4 }).map((_, index) => (
          <PortalSkeletonBlock key={`parent-homework-loading-${index}`} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="parent-homework-inbox-page">
      <PageHeader
        titleKey="parentHomework.inbox.title"
        subtitleKey="parentHomework.inbox.subtitle"
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="parent-homework-filters">
          {showStudentFilter ? (
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              {t("parentHomework.inbox.filters.child")}
              <select
                className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
                value={selectedStudentId}
                onChange={(event) => onFilterChange({ studentId: event.target.value })}
              >
                <option value="all">{t("parentHomework.inbox.filters.childAll")}</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.firstName} {student.lastName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {t("parentHomework.inbox.filters.status")}
            <select
              className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              value={status}
              onChange={(event) => onFilterChange({ status: event.target.value as StatusFilter })}
            >
              <option value="ALL">{t("parentHomework.inbox.filters.statusAll")}</option>
              {/* UNASSIGNED is a display status backed by ASSIGNED rows with no assignment file. */}
              <option value="UNASSIGNED">{t("homework.status.unassigned")}</option>
              <option value="ASSIGNED">{t("homework.status.assigned")}</option>
              <option value="SUBMITTED">{t("homework.status.submitted")}</option>
              <option value="REVIEWED">{t("homework.status.reviewed")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {t("parentHomework.inbox.filters.dateFrom")}
            <input
              type="date"
              className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              value={fromDate}
              onChange={(event) => onFilterChange({ from: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {t("parentHomework.inbox.filters.dateTo")}
            <input
              type="date"
              className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
              value={toDate}
              onChange={(event) => onFilterChange({ to: event.target.value })}
            />
          </label>
        </div>
      </Card>

      {hasError ? (
        <Card>
          <div className="space-y-3 text-center" data-testid="parent-homework-error">
            <h2 className="text-base font-semibold text-[var(--text)]">{t("parentHomework.error.title")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("parentHomework.error.body")}</p>
            <button
              type="button"
              onClick={() => void loadInbox()}
              className="inline-flex h-11 items-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)]"
            >
              {t("parentHomework.error.retry")}
            </button>
          </div>
        </Card>
      ) : null}

      {!hasError && !items.length ? (
        <Card>
          <div className="space-y-2 text-center" data-testid="parent-homework-empty">
            <h2 className="text-base font-semibold text-[var(--text)]">{t("parentHomework.empty.title")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("parentHomework.empty.body")}</p>
          </div>
        </Card>
      ) : null}

      {!hasError && items.length ? (
        <div className="grid gap-3" data-testid="parent-homework-list">
          {items.map((item) => {
            const detailHref = `/${tenant}/portal/homework/${item.homeworkItemId}`;
            const studentLabel = studentNameById.get(item.studentId);

            return (
              <Card key={item.homeworkItemId} padding="normal">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                  <div className="space-y-1">
                    <Link href={detailHref} className="text-sm font-semibold text-[var(--text)] underline">
                      {formatPortalDateTime(item.sessionDate, locale, item.timezone ?? undefined) || item.sessionDate}
                    </Link>
                    {selectedStudentId === "all" && studentLabel ? (
                      <p className="text-sm text-[var(--muted)]">{studentLabel}</p>
                    ) : null}
                    {item.programLabel ? (
                      <p className="text-sm text-[var(--muted)]">{item.programLabel}</p>
                    ) : null}
                    <HomeworkStatusBadge
                      status={toHomeworkDisplayStatus({
                        status: item.status,
                        assignmentCount: item.fileCounts.assignment,
                      })}
                    />
                  </div>

                  <div className="flex flex-col items-start gap-2 md:items-end">
                    {item.fileCounts.assignment > 0 ? (
                      <Link href={detailHref} className="text-xs font-semibold text-[var(--primary)] underline">
                        {t("parentHomework.inbox.action.downloadAssignment")}
                      </Link>
                    ) : null}
                    {item.status !== "REVIEWED" ? (
                      <Link href={detailHref} className="text-xs font-semibold text-[var(--primary)] underline">
                        {t("parentHomework.inbox.action.uploadSubmission")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {!hasError ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs text-[var(--muted)]">
            {t("parentHomework.pagination.range", {
              from: totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
              to: Math.min(page * PAGE_SIZE, totalCount),
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-60"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t("parentHomework.pagination.prev")}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-60"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              {t("parentHomework.pagination.next")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
