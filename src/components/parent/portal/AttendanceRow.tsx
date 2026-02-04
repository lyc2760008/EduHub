"use client";

// Attendance row used in the student detail attendance tab.
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import { usePortalMe } from "@/components/parent/portal/PortalMeProvider";
import {
  formatPortalDateTime,
  formatPortalDateTimeRange,
  getAttendanceStatusLabelKey,
  getSessionTypeLabelKey,
} from "@/lib/portal/format";

type AttendanceRowProps = {
  attendance: {
    id: string;
    dateTime: string;
    sessionEndAt?: string | null;
    status: string;
    sessionType: string;
    groupName?: string | null;
    parentVisibleNote?: string | null;
  };
  href?: string;
};

function buildNotePreview(note: string, limit: number) {
  if (note.length <= limit) return note;
  return `${note.slice(0, limit).trimEnd()}...`;
}

export default function AttendanceRow({ attendance, href }: AttendanceRowProps) {
  const t = useTranslations();
  const locale = useLocale();
  // Attendance timestamps should match the portal-wide time zone hint.
  const { data: portalMe } = usePortalMe();
  const timeZone = portalMe?.tenant?.timeZone ?? undefined;
  const statusKey = getAttendanceStatusLabelKey(attendance.status);
  const sessionTypeKey = getSessionTypeLabelKey(attendance.sessionType);
  const sessionTitle = attendance.groupName?.trim()
    ? attendance.groupName
    : sessionTypeKey
      ? t(sessionTypeKey)
      : t("generic.dash");
  const trimmedNote = attendance.parentVisibleNote?.trim() ?? "";
  // Render a truncated note preview only when the parent-visible note is present.
  const notePreview = trimmedNote
    ? {
        mobile: buildNotePreview(trimmedNote, 50),
        desktop: buildNotePreview(trimmedNote, 80),
      }
    : null;
  const statusToneClassName = statusKey
    ? "border-[var(--info)] text-[var(--info)]"
    : "border-[var(--border)] text-[var(--muted)]";
  const dateTimeLabel =
    formatPortalDateTimeRange(
      attendance.dateTime,
      attendance.sessionEndAt,
      locale,
      timeZone,
    ) || formatPortalDateTime(attendance.dateTime, locale, timeZone);

  const body = (
    <Card padding="normal">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--text)]">
            {dateTimeLabel}
          </p>
          <p className="text-xs text-[var(--muted)]">{sessionTitle}</p>
          {notePreview ? (
            <p
              className="text-xs text-[var(--muted-2)]"
              // Data-testid keeps note previews stable for portal E2E coverage.
              data-testid={`portal-attendance-note-preview-${attendance.id}`}
            >
              <span className="font-medium text-[var(--muted)]">
                {t("portal.attendance.notePreview.label")}
              </span>{" "}
              <span className="md:hidden">{notePreview.mobile}</span>
              <span className="hidden md:inline">{notePreview.desktop}</span>
            </p>
          ) : null}
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${statusToneClassName}`}
        >
          {statusKey ? t(statusKey) : t("generic.dash")}
        </span>
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link
        href={href}
        // Keep attendance rows clickable for session detail navigation.
        data-testid={`portal-attendance-row-${attendance.id}`}
        className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
      >
        {body}
      </Link>
    );
  }

  return <div data-testid={`portal-attendance-row-${attendance.id}`}>{body}</div>;
}

