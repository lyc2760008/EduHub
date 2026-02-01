"use client";

// Attendance row used in the student detail attendance tab.
import { useLocale, useTranslations } from "next-intl";

import Card from "@/components/parent/Card";
import { formatPortalDateTime, getAttendanceStatusLabelKey, getSessionTypeLabelKey } from "@/lib/portal/format";

type AttendanceRowProps = {
  attendance: {
    id: string;
    dateTime: string;
    status: string;
    sessionType: string;
    groupName?: string | null;
  };
};

export default function AttendanceRow({ attendance }: AttendanceRowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const statusKey = getAttendanceStatusLabelKey(attendance.status);
  const sessionTypeKey = getSessionTypeLabelKey(attendance.sessionType);
  const sessionTitle = attendance.groupName?.trim()
    ? attendance.groupName
    : sessionTypeKey
      ? t(sessionTypeKey)
      : t("generic.dash");
  const statusToneClassName = statusKey
    ? "border-[var(--info)] text-[var(--info)]"
    : "border-[var(--border)] text-[var(--muted)]";

  return (
    <div data-testid={`portal-attendance-row-${attendance.id}`}>
      <Card padding="normal">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[var(--text)]">
              {formatPortalDateTime(attendance.dateTime, locale)}
            </p>
            <p className="text-xs text-[var(--muted)]">{sessionTitle}</p>
          </div>
          <span
            className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${statusToneClassName}`}
          >
            {statusKey ? t(statusKey) : t("generic.dash")}
          </span>
        </div>
      </Card>
    </div>
  );
}

