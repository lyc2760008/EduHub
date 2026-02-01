"use client";

// Session attendance client section fetches roster attendance and saves updates.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import AdminTable, {
  type AdminTableColumn,
} from "@/components/admin/shared/AdminTable";
import { inputBase, primaryButton } from "@/components/admin/shared/adminUiClasses";
import { fetchJson } from "@/lib/api/fetchJson";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type StudentSummary = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
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
  }>;
};

type AttendanceRow = {
  student: StudentSummary;
  status: AttendanceStatus | null;
  note: string;
  parentVisibleNote: string;
};

type SessionAttendanceSectionProps = {
  sessionId: string;
  tenant: string;
};

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus | "unset";
  labelKey: string;
}> = [
  { value: "unset", labelKey: "admin.sessions.attendance.status.unset" },
  { value: "PRESENT", labelKey: "admin.sessions.attendance.status.present" },
  { value: "ABSENT", labelKey: "admin.sessions.attendance.status.absent" },
  { value: "LATE", labelKey: "admin.sessions.attendance.status.late" },
  { value: "EXCUSED", labelKey: "admin.sessions.attendance.status.excused" },
];

function formatStudentName(student: StudentSummary) {
  // Prefer preferredName when available to match roster display semantics.
  if (student.preferredName?.trim()) {
    return `${student.preferredName} ${student.lastName}`;
  }
  return `${student.firstName} ${student.lastName}`;
}

export default function SessionAttendanceSection({
  sessionId,
  tenant,
}: SessionAttendanceSectionProps) {
  const t = useTranslations();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

    const nextRows = result.data.roster.map((entry) => ({
      student: entry.student,
      status: entry.attendance?.status ?? null,
      note: entry.attendance?.note ?? "",
      parentVisibleNote: entry.attendance?.parentVisibleNote ?? "",
    }));
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
        return (
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
        <p className="mt-3 text-sm text-green-600" data-testid="attendance-save-success">
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
  );
}
