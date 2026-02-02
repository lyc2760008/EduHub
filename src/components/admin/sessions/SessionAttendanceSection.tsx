"use client";

// Session attendance client section fetches roster attendance and saves updates.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import {
  inputBase,
  primaryButton,
  secondaryButton,
} from "@/components/admin/shared/adminUiClasses";
import { fetchJson } from "@/lib/api/fetchJson";
import type { Role } from "@/generated/prisma/client";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type AbsenceRequestStatus = "PENDING" | "APPROVED" | "DECLINED";

type StudentSummary = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

type AbsenceRequestSummary = {
  id: string;
  status: AbsenceRequestStatus;
  reasonCode: string;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  internalNote?: string | null;
};

type AttendancePayload = {
  session: {
    id: string;
    tutorId: string;
    centerId: string;
    startAt: string;
    endAt: string;
    sessionType: string;
  };
  roster: Array<{
    student: StudentSummary;
    attendance: {
      status: AttendanceStatus;
      note: string | null;
      parentVisibleNote: string | null;
      markedAt: string;
      markedByUserId: string;
    } | null;
    absenceRequest: AbsenceRequestSummary | null;
  }>;
};

type AttendanceRow = {
  student: StudentSummary;
  status: AttendanceStatus | null;
  note: string;
  parentVisibleNote: string;
  absenceRequest: AbsenceRequestSummary | null;
  autoFilled: boolean;
};

type AbsenceRequestEntry = {
  student: StudentSummary;
  request: AbsenceRequestSummary;
};

type SessionAttendanceSectionProps = {
  sessionId: string;
  tenant: string;
  viewerRole: Role;
  viewerName: string | null;
  viewerEmail: string;
};

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus | "unset";
  labelKey: string;
}> = [
  { value: "unset", labelKey: "admin.sessions.attendance.status.unset" },
  { value: "PRESENT", labelKey: "admin.sessions.attendance.status.present" },
  { value: "ABSENT", labelKey: "admin.sessions.attendance.status.absent" },
  { value: "LATE", labelKey: "admin.sessions.attendance.status.late" },
  { value: "EXCUSED", labelKey: "staff.attendance.status.excusedAbsent" },
];

const ABSENCE_REASON_LABELS: Record<string, string> = {
  ILLNESS: "portal.absence.reason.illness",
  TRAVEL: "portal.absence.reason.travel",
  FAMILY: "portal.absence.reason.family",
  SCHOOL_CONFLICT: "portal.absence.reason.schoolConflict",
  OTHER: "portal.absence.reason.other",
};

// Map request status to staff i18n keys and visual tones.
function getAbsenceStatusLabelKey(status: AbsenceRequestStatus) {
  switch (status) {
    case "PENDING":
      return "staff.absence.status.pending";
    case "APPROVED":
      return "staff.absence.status.approved";
    case "DECLINED":
      return "staff.absence.status.declined";
  }
}

function getAbsenceStatusTone(status: AbsenceRequestStatus) {
  switch (status) {
    case "APPROVED":
      return "border-green-600 text-green-700";
    case "DECLINED":
      return "border-slate-300 text-slate-600";
    case "PENDING":
      return "border-amber-600 text-amber-700";
  }
}

const ABSENCE_BANNER_CONFIG: Record<
  AbsenceRequestStatus,
  { toneClassName: string; titleKey: string; bodyKey: string }
> = {
  APPROVED: {
    toneClassName: "border-green-200 bg-green-50 text-green-900",
    titleKey: "staff.absence.banner.approved.title",
    bodyKey: "staff.absence.banner.approved.body",
  },
  PENDING: {
    toneClassName: "border-blue-200 bg-blue-50 text-blue-900",
    titleKey: "staff.absence.banner.pending.title",
    bodyKey: "staff.absence.banner.pending.body",
  },
  DECLINED: {
    toneClassName: "border-slate-200 bg-slate-50 text-slate-800",
    titleKey: "staff.absence.banner.declined.title",
    bodyKey: "staff.absence.banner.declined.body",
  },
};

function formatStudentName(student: StudentSummary) {
  // Prefer preferredName when available to match roster display semantics.
  if (student.preferredName?.trim()) {
    return `${student.preferredName} ${student.lastName}`;
  }
  return `${student.firstName} ${student.lastName}`;
}

function formatRequestDateTime(value: string, locale: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function SessionAttendanceSection({
  sessionId,
  tenant,
  viewerRole,
  viewerName,
  viewerEmail,
}: SessionAttendanceSectionProps) {
  const t = useTranslations();
  const locale = useLocale();
  const isAdmin = viewerRole === "Owner" || viewerRole === "Admin";
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resolveToast, setResolveToast] = useState<string | null>(null);
  const [resolveErrorById, setResolveErrorById] = useState<
    Record<string, string>
  >({});
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(
    null,
  );

  const loadAttendance = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Use /t/<tenant>/api to ensure tenant resolution in path-based setups.
    const result = await fetchJson<AttendancePayload>(
      `/t/${tenant}/api/sessions/${sessionId}/attendance`,
    );

    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        setError(t("admin.sessions.messages.forbidden"));
      } else {
        setError(t("admin.sessions.attendance.loadError"));
      }
      setRows([]);
      setIsLoading(false);
      return;
    }

    const nextRows = result.data.roster.map((entry) => {
      const existingStatus = entry.attendance?.status ?? null;
      const hasApprovedRequest = entry.absenceRequest?.status === "APPROVED";
      const autoFilled = !existingStatus && hasApprovedRequest;
      // Auto-assist only pre-fills when attendance is unset, never overwriting saved status.
      return {
        student: entry.student,
        status: autoFilled ? "EXCUSED" : existingStatus,
        note: entry.attendance?.note ?? "",
        parentVisibleNote: entry.attendance?.parentVisibleNote ?? "",
        absenceRequest: entry.absenceRequest,
        autoFilled,
      };
    });
    setRows(nextRows);
    setIsLoading(false);
  }, [sessionId, t, tenant]);

  useEffect(() => {
    // Defer load to avoid setState directly in the effect body.
    const handle = setTimeout(() => {
      void loadAttendance();
    }, 0);
    return () => clearTimeout(handle);
  }, [loadAttendance]);

  const rosterCountLabel = useMemo(
    () =>
      t("admin.sessions.fields.studentsCount", {
        count: rows.length,
      }),
    [rows.length, t],
  );

  const absenceRequests = useMemo(
    () =>
      rows
        .filter((row) => row.absenceRequest)
        .map((row) => ({
          student: row.student,
          request: row.absenceRequest!,
        })),
    [rows],
  );
  const hasAbsenceRequests = absenceRequests.length > 0;
  const hasPendingRequests = absenceRequests.some(
    (entry) => entry.request.status === "PENDING",
  );
  const panelToneClassName = hasPendingRequests
    ? "border-amber-200 bg-amber-50"
    : "border-slate-200 bg-white";

  const handleStatusChange = useCallback(
    (studentId: string, status: AttendanceStatus | null) => {
      setMessage(null);
      setRows((current) =>
        current.map((row) =>
          row.student.id === studentId
            ? {
                ...row,
                status,
                // Clearing notes when status is unset avoids storing orphaned notes.
                note: status ? row.note : "",
                // Keep parent-visible notes in sync with attendance status.
                parentVisibleNote: status ? row.parentVisibleNote : "",
              }
            : row,
        ),
      );
    },
    [],
  );

  const handleNoteChange = useCallback((studentId: string, note: string) => {
    setMessage(null);
    setRows((current) =>
      current.map((row) =>
        row.student.id === studentId ? { ...row, note } : row,
      ),
    );
  }, []);

  const handleParentNoteChange = useCallback(
    (studentId: string, parentVisibleNote: string) => {
      setMessage(null);
      setRows((current) =>
        current.map((row) =>
          row.student.id === studentId ? { ...row, parentVisibleNote } : row,
        ),
      );
    },
    [],
  );

  const handleResolveRequest = useCallback(
    async (request: AbsenceRequestSummary, nextStatus: AbsenceRequestStatus) => {
      const confirmKey =
        nextStatus === "APPROVED"
          ? "staff.absence.confirm.approve"
          : "staff.absence.confirm.decline";
      if (!window.confirm(t(confirmKey))) {
        return;
      }

      setResolvingRequestId(request.id);
      setResolveToast(null);
      setResolveErrorById((current) => {
        const { [request.id]: _removed, ...rest } = current;
        // Explicitly reference removed entry to satisfy no-unused-vars lint.
        void _removed;
        return rest;
      });

      const result = await fetchJson<{
        request: {
          id: string;
          status: AbsenceRequestStatus;
          resolvedAt: string | null;
          resolvedByUserId: string | null;
        };
      }>(`/api/requests/${request.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!result.ok) {
        setResolveErrorById((current) => ({
          ...current,
          [request.id]: t("staff.absence.error.body"),
        }));
        setResolvingRequestId(null);
        return;
      }

      // Update the request summary in-place to avoid clobbering unsaved attendance edits.
      setRows((current) =>
        current.map((row) => {
          if (row.absenceRequest?.id !== request.id) return row;
          const approved = result.data.request.status === "APPROVED";
          const shouldAutoFill = approved && row.status === null;
          return {
            ...row,
            status: shouldAutoFill ? "EXCUSED" : row.status,
            autoFilled: shouldAutoFill ? true : row.autoFilled,
            absenceRequest: {
              ...row.absenceRequest,
              status: result.data.request.status,
              resolvedAt: result.data.request.resolvedAt,
              resolvedBy: {
                id:
                  result.data.request.resolvedByUserId ??
                  row.absenceRequest.resolvedBy?.id ??
                  viewerEmail,
                name: viewerName ?? row.absenceRequest.resolvedBy?.name ?? null,
                email:
                  row.absenceRequest.resolvedBy?.email ?? viewerEmail ?? "",
              },
            },
          };
        }),
      );

      setResolvingRequestId(null);
      setResolveToast(t("staff.absence.toast.resolved"));
    },
    [t, viewerEmail, viewerName],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      items: rows.map((row) => ({
        studentId: row.student.id,
        status: row.status,
        note: row.status ? row.note.trim() || null : null,
        parentVisibleNote: row.status
          ? row.parentVisibleNote.trim() || null
          : null,
      })),
    };

    const result = await fetchJson<unknown>(
      `/t/${tenant}/api/sessions/${sessionId}/attendance`,
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
        setError(t("admin.sessions.attendance.errorSaving"));
      }
      setIsSaving(false);
      return;
    }

    setMessage(t("admin.sessions.attendance.saved"));
    setIsSaving(false);
  }, [rows, sessionId, t, tenant]);

  const renderRequestDetails = (entry: AbsenceRequestEntry) => {
    const { request, student } = entry;
    const statusLabelKey = getAbsenceStatusLabelKey(request.status);
    const reasonLabelKey =
      ABSENCE_REASON_LABELS[request.reasonCode] ?? "generic.dash";
    const submittedLabel =
      formatRequestDateTime(request.createdAt, locale) || t("generic.dash");
    const resolvedLabel = request.resolvedAt
      ? formatRequestDateTime(request.resolvedAt, locale)
      : "";
    const resolvedByLabel = request.resolvedBy?.name?.trim()
      ? request.resolvedBy.name
      : request.resolvedBy?.email;
    const resolveError = resolveErrorById[request.id];
    const isResolving = resolvingRequestId === request.id;
    const isResolved = request.status !== "PENDING";

    return (
      <div className="flex flex-col gap-4">
        {resolveError ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm font-semibold text-red-700">
              {t("staff.absence.error.title")}
            </p>
            <p className="text-xs text-red-700">
              {t("staff.absence.error.body")}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">
              {t("staff.absence.field.status")}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getAbsenceStatusTone(
                request.status,
              )}`}
              // Data-testid lets E2E assert resolved/pending status chips deterministically.
              data-testid={`absence-request-status-${request.id}`}
            >
              {statusLabelKey ? t(statusLabelKey) : t("generic.dash")}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">
              {t("staff.absence.field.student")}
            </span>
            <span>{formatStudentName(student)}</span>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">
              {t("staff.absence.field.submittedAt")}
            </span>
            <span>{submittedLabel}</span>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">
              {t("staff.absence.field.reason")}
            </span>
            <span>{t(reasonLabelKey)}</span>
          </div>
          {request.message ? (
            <div className="space-y-1 md:col-span-2">
              <span className="text-xs font-semibold text-slate-500">
                {t("staff.absence.field.message")}
              </span>
              <p className="whitespace-pre-line text-sm text-slate-700">
                {request.message}
              </p>
            </div>
          ) : null}
        </div>

        {isResolved ? (
          <div className="grid gap-4 border-t border-slate-200 pt-4 text-sm text-slate-700 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">
                {t("staff.absence.field.status")}
              </span>
              <span>{statusLabelKey ? t(statusLabelKey) : t("generic.dash")}</span>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">
                {t("staff.absence.field.resolvedBy")}
              </span>
              <span>
                {resolvedByLabel?.trim() ? resolvedByLabel : t("generic.dash")}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">
                {t("staff.absence.field.resolvedAt")}
              </span>
              <span>{resolvedLabel || t("generic.dash")}</span>
            </div>
            {/* Internal note renders only if the API adds staff-only notes in the future. */}
            {isAdmin && request.internalNote ? (
              <div className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold text-slate-500">
                  {t("staff.absence.field.internalNote")}
                </span>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {request.internalNote}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {isAdmin && request.status === "PENDING" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={isResolving}
              onClick={() => void handleResolveRequest(request, "APPROVED")}
            >
              {isResolving ? (
                <span
                  className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden="true"
                />
              ) : null}
              {t("staff.absence.action.approve")}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={isResolving}
              onClick={() => void handleResolveRequest(request, "DECLINED")}
            >
              {isResolving ? (
                <span
                  className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
                  aria-hidden="true"
                />
              ) : null}
              {t("staff.absence.action.decline")}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const columns: AdminTableColumn<AttendanceRow>[] = [
    {
      header: t("admin.sessions.fields.student"),
      cell: (row) => (
        <span className="text-sm font-medium text-slate-900">
          {formatStudentName(row.student)}
        </span>
      ),
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.attendance.statusLabel"),
      cell: (row) => {
        const selectId = `attendance-status-${row.student.id}`;
        const currentValue = row.status ?? "unset";
        const absenceRequest = row.absenceRequest;
        const bannerConfig = absenceRequest
          ? ABSENCE_BANNER_CONFIG[absenceRequest.status]
          : null;
        return (
          <div className="flex flex-col gap-2">
            {bannerConfig ? (
              <div
                className={`rounded border px-3 py-2 text-xs ${bannerConfig.toneClassName}`}
                // Data-testid keeps absence banners stable for per-student assertions.
                data-testid={`attendance-absence-banner-${row.student.id}`}
                data-status={absenceRequest?.status ?? ""}
              >
                <p className="text-xs font-semibold">
                  {t(bannerConfig.titleKey)}
                </p>
                <p className="mt-1 text-xs">{t(bannerConfig.bodyKey)}</p>
              </div>
            ) : null}
            <select
              id={selectId}
              className={`${inputBase} min-w-[160px]`}
              // Include student id so tests can target specific rows deterministically.
              data-testid={`attendance-status-select-${row.student.id}`}
              value={currentValue}
              disabled={isLoading || isSaving}
              aria-label={`${t("admin.sessions.attendance.statusLabel")} - ${formatStudentName(
                row.student,
              )}`}
              onChange={(event) => {
                const value = event.target.value;
                handleStatusChange(
                  row.student.id,
                  value === "unset" ? null : (value as AttendanceStatus),
                );
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            {/* Deviation: helper text only appears when this screen pre-fills attendance. */}
            {row.autoFilled ? (
              <p className="text-xs text-slate-500">
                {t("staff.absence.autoAssist.overrideHelper")}
              </p>
            ) : null}
          </div>
        );
      },
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.attendance.note.internal.label"),
      cell: (row) => {
        const inputId = `attendance-note-${row.student.id}`;
        return (
          <div className="flex flex-col gap-1">
            <input
              id={inputId}
              className={inputBase}
              data-testid={`attendance-note-${row.student.id}`}
              value={row.note}
              disabled={isLoading || isSaving}
              aria-label={`${t("admin.sessions.attendance.note.internal.label")} - ${formatStudentName(
                row.student,
              )}`}
              onChange={(event) =>
                handleNoteChange(row.student.id, event.target.value)
              }
            />
            <p className="text-xs text-slate-500">
              {t("admin.sessions.attendance.note.internal.helper")}
            </p>
          </div>
        );
      },
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
    {
      header: t("admin.sessions.attendance.note.parentVisible.label"),
      cell: (row) => {
        const inputId = `attendance-parent-note-${row.student.id}`;
        return (
          <div className="flex flex-col gap-1">
            <textarea
              id={inputId}
              rows={3}
              className={`${inputBase} min-h-[88px] resize-y`}
              data-testid={`attendance-parent-note-${row.student.id}`}
              value={row.parentVisibleNote}
              disabled={isLoading || isSaving}
              aria-label={`${t("admin.sessions.attendance.note.parentVisible.label")} - ${formatStudentName(
                row.student,
              )}`}
              onChange={(event) =>
                handleParentNoteChange(row.student.id, event.target.value)
              }
            />
            <p className="text-xs text-slate-500">
              {t("admin.sessions.attendance.note.parentVisible.helper")}
            </p>
            <p className="text-xs text-slate-500">
              {t("admin.sessions.attendance.note.parentVisible.guidance")}
            </p>
          </div>
        );
      },
      headClassName: "px-4 py-3",
      cellClassName: "px-4 py-3",
    },
  ];

  return (
    <>
      {hasAbsenceRequests ? (
        <section
          className={`rounded border p-5 ${panelToneClassName}`}
          data-testid="absence-request-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {t("staff.absence.panel.title")}
            </h2>
            {resolveToast ? (
              <span className="text-sm text-green-700">{resolveToast}</span>
            ) : null}
          </div>

          {absenceRequests.length === 1 ? (
            <div className="mt-4">{renderRequestDetails(absenceRequests[0])}</div>
          ) : (
            // Compact accordion keeps multi-student requests readable without new pages.
            <div className="mt-4 space-y-3">
              {absenceRequests.map((entry) => {
                const statusLabelKey = getAbsenceStatusLabelKey(
                  entry.request.status,
                );
                const reasonLabelKey =
                  ABSENCE_REASON_LABELS[entry.request.reasonCode] ??
                  "generic.dash";
                const submittedLabel =
                  formatRequestDateTime(entry.request.createdAt, locale) ||
                  t("generic.dash");
                return (
                  <details
                    key={entry.request.id}
                    className="rounded border border-slate-200 bg-white"
                  >
                    <summary className="flex cursor-pointer items-start justify-between gap-4 px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-slate-900">
                          {formatStudentName(entry.student)}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{submittedLabel}</span>
                          <span aria-hidden="true">-</span>
                          <span>{t(reasonLabelKey)}</span>
                          {entry.request.message ? (
                            <span className="max-w-[240px] truncate">
                              {entry.request.message}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getAbsenceStatusTone(
                          entry.request.status,
                        )}`}
                        // Data-testid keeps summary status chips stable in multi-request panels.
                        data-testid={`absence-request-status-summary-${entry.request.id}`}
                      >
                        {statusLabelKey ? t(statusLabelKey) : t("generic.dash")}
                      </span>
                    </summary>
                    <div className="px-3 pb-3 pt-2">
                      {renderRequestDetails(entry)}
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-600">
            {t("staff.absence.panel.disclaimer")}
          </p>
        </section>
      ) : null}

      <section
        className="rounded border border-slate-200 bg-white p-5"
        data-testid="attendance-section"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {t("admin.sessions.attendance.sectionTitle")}
            </h2>
            <p className="text-sm text-slate-500">{rosterCountLabel}</p>
          </div>
          <button
            className={primaryButton}
            // Stable test id used by attendance E2E coverage.
            data-testid="attendance-save-button"
            disabled={isLoading || isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving
              ? t("admin.sessions.attendance.saving")
              : t("admin.sessions.attendance.save")}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {message ? (
          <p
            className="mt-3 text-sm text-green-600"
            data-testid="attendance-save-success"
          >
            {message}
          </p>
        ) : null}

        <div className="mt-4">
          <AdminTable
            rows={rows}
            columns={columns}
            rowKey={(row) => `attendance-row-${row.student.id}`}
            testId="attendance-table"
            isLoading={isLoading}
            loadingState={t("common.loading")}
            emptyState={t("admin.sessions.messages.noRoster")}
          />
        </div>
      </section>
    </>
  );
}
